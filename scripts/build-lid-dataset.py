#!/usr/bin/env python3
"""Builds train/test sets for the chat language model (examples/lid_train.rs).

Usage: scripts/build-lid-dataset.py  (reads and writes under eval/)

Labels: en, ru, ru-latin, other. Sources:
- chat Latin-script messages: Haiku review verdict if reviewed (eval/review/), otherwise tongue's "en";
  tongue's non-English verdicts are unreliable and are skipped until reviewed
- chat Cyrillic-only messages: ru
- synthetic ru-latin: chat Cyrillic-only messages, transliterated with randomized schemes
- other: Tatoeba sentences (scripts/fetch-tatoeba.sh)

Chat messages from TEST_YEAR, as well as the reviewed random pilot sample (batch*), go to the test set.
Output: eval/lid/{train,test}.jsonl, one {"label", "source", "text"} per line.
"""

import glob
import hashlib
import json
import os
import random
import re

TEST_YEAR = "2026"
REVIEW_LABELS = "eval/review-labels.tsv"
MAX_TRAIN = {"ru": 60_000, "ru-latin": 60_000}
MAX_TEST = {"en": 20_000, "ru": 5_000, "ru-latin": 5_000}

URL_RE = re.compile(r"\S+://\S+")
LATIN_RE = re.compile(r"[A-Za-z]")
CYRILLIC_RE = re.compile("[Ѐ-ӿ]")

# Options per letter, one is picked per message, so a message is consistent in its scheme
TRANSLIT = {
    "а": ["a"], "б": ["b"], "в": ["v", "v", "v", "w"], "г": ["g", "g", "g", "h"], "д": ["d"],
    "е": ["e", "e", "e", "ye"], "ё": ["yo", "jo", "e", "io"], "ж": ["zh", "zh", "j", "g", "z"],
    "з": ["z"], "и": ["i"], "й": ["y", "j", "i", ""], "к": ["k"], "л": ["l"], "м": ["m"], "н": ["n"],
    "о": ["o"], "п": ["p"], "р": ["r"], "с": ["s"], "т": ["t"], "у": ["u", "u", "u", "ou"], "ф": ["f"],
    "х": ["h", "kh", "x"], "ц": ["ts", "c", "tc", "tz"], "ч": ["ch", "ch", "tch"], "ш": ["sh", "sh", "w"],
    "щ": ["sch", "sh", "shch", "w"], "ъ": ["", "'"], "ы": ["y", "i", "y"], "ь": ["", "'", "'"],
    "э": ["e", "e", "a"], "ю": ["yu", "ju", "iu", "u"], "я": ["ya", "ja", "ia", "ya"],
}


def transliterate(text: str, rng: random.Random) -> str:
    scheme = {letter: rng.choice(options) for letter, options in TRANSLIT.items()}
    out = []
    for c in text:
        lower = c.lower()
        if lower not in scheme:
            out.append(c)
            continue
        # Occasional inconsistency within a message, as in real texts
        latin = rng.choice(TRANSLIT[lower]) if rng.random() < 0.05 else scheme[lower]
        out.append(latin.capitalize() if c != lower else latin)
    return "".join(out)


def stable_fraction(key: str) -> float:
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF


def review_labels() -> tuple[dict[str, str], set[str]]:
    """Haiku-reviewed messages: the detector class, unless the reviewer flagged it, and ids of the pilot sample.

    Collected labels are saved to REVIEW_LABELS (no message texts), which is read instead
    when the review batches are gone.
    """
    labels, pilot = {}, set()
    batches = glob.glob("eval/review/*.tsv")
    if not batches and os.path.exists(REVIEW_LABELS):
        for line in open(REVIEW_LABELS, encoding="utf-8"):
            id, label, is_pilot = line.rstrip("\n").split("\t")
            labels[id] = label
            if is_pilot == "1":
                pilot.add(id)
        return labels, pilot
    for tsv in batches:
        if tsv.endswith(".out.tsv"):
            continue
        out = tsv.removesuffix(".tsv") + ".out.jsonl"
        out_by_line = tsv.removesuffix(".tsv") + ".out.tsv"
        if os.path.exists(out_by_line):
            labels.update(read_labels_by_line(tsv, out_by_line))
            continue
        if not os.path.exists(out):
            continue
        for line in open(tsv, encoding="utf-8"):
            id, detector, _ = line.split("\t", 2)
            labels[id] = detector
            if os.path.basename(tsv).startswith("batch"):
                pilot.add(id)
        for line in open(out, encoding="utf-8"):
            if line.strip():
                row = json.loads(line)
                labels[row["id"]] = row["truth"]
    with open(REVIEW_LABELS, "w", encoding="utf-8") as f:
        f.writelines(f"{id}\t{label}\t{int(id in pilot)}\n" for id, label in sorted(labels.items()))
    return labels, pilot


def read_labels_by_line(tsv: str, out: str) -> dict[str, str]:
    """Reviews listing only non-English messages by line number, so everything else is "en".

    Lines whose copied detector class doesn't match the batch are misaligned and skipped.
    """
    rows = [line.split("\t", 2)[:2] for line in open(tsv, encoding="utf-8")]
    labels = {id: "en" for id, _ in rows}
    misaligned = 0
    for line in open(out, encoding="utf-8"):
        if not line.strip():
            continue
        number, detector, truth = line.rstrip("\n").split("\t")
        index = int(number) - 1
        if not 0 <= index < len(rows):
            misaligned += 1
        elif rows[index][1] != detector:
            misaligned += 1
            del labels[rows[index][0]]  # unknown truth, can't default to "en"
        else:
            labels[rows[index][0]] = truth
    if misaligned:
        print(f"{out}: {misaligned} misaligned lines skipped")
    return labels


def to_label(review_class: str) -> str | None:
    """Review classes to model labels, None for messages to exclude (mixed, unclear).

    Reviewers sometimes label Cyrillic Russian (messages with long urls in early batches) as "ru" or "other:ru".
    """
    if review_class == "en":
        return "en"
    if review_class in ("ru-latn", "ru-latin"):
        return "ru-latin"
    if review_class.startswith("other") and review_class != "other:ru":
        return "other"
    return None


def main():
    rng = random.Random(42)
    reviewed, pilot = review_labels()
    tongue = {}
    for line in open("eval/full-latin-tongue.jsonl", encoding="utf-8"):
        row = json.loads(line)
        tongue[row["id"]] = row["language"]

    train, test = [], []
    cyrillic = {"train": [], "test": []}
    for line in open("eval/full.jsonl", encoding="utf-8"):
        msg = json.loads(line)
        text = msg["text"]
        split = "test" if msg["date"].startswith(TEST_YEAR) else "train"
        # Without urls, a link shouldn't turn a Russian message into a Latin-script one
        no_urls = URL_RE.sub("", text)
        n_latin, n_cyrillic = len(LATIN_RE.findall(no_urls)), len(CYRILLIC_RE.findall(no_urls))
        if n_latin + n_cyrillic < 5:
            continue
        if n_latin == 0:
            cyrillic[split].append(text)
            continue
        if n_latin <= n_cyrillic:
            continue  # en/ru mixes are handled by letter counts in the bot
        if msg["id"] in reviewed:
            label, source = to_label(reviewed[msg["id"]]), "chat-reviewed"
            if msg["id"] in pilot:
                split = "test"
        elif tongue.get(msg["id"]) == "en":
            label, source = "en", "chat-tongue"
        else:
            continue
        if label:
            (test if split == "test" else train).append({"label": label, "source": source, "text": text})

    for split, rows in (("train", train), ("test", test)):
        texts = cyrillic[split]
        rng.shuffle(texts)
        limits = MAX_TRAIN if split == "train" else MAX_TEST
        half = len(texts) // 2  # disjoint messages for ru and ru-latin
        rows += [{"label": "ru", "source": "chat", "text": t} for t in texts[: min(half, limits["ru"])]]
        rows += [
            {"label": "ru-latin", "source": "synthetic", "text": transliterate(t, rng)}
            for t in texts[half : half + limits["ru-latin"]]
        ]

    for path in sorted(glob.glob("eval/tatoeba/*.tsv")):
        for line in open(path, encoding="utf-8"):
            _, lang, text = line.rstrip("\n").split("\t", 2)
            row = {"label": "other", "source": f"tatoeba-{lang}", "text": text}
            (test if stable_fraction(text) < 0.1 else train).append(row)

    # Capping the biggest test class, keeping reviewed messages
    en_test = [r for r in test if r["label"] == "en" and r["source"] == "chat-tongue"]
    if len(en_test) > MAX_TEST["en"]:
        drop = {id(r) for r in rng.sample(en_test, len(en_test) - MAX_TEST["en"])}
        test = [r for r in test if id(r) not in drop]

    os.makedirs("eval/lid", exist_ok=True)
    for name, rows in (("train", train), ("test", test)):
        rng.shuffle(rows)
        with open(f"eval/lid/{name}.jsonl", "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
        counts = {}
        for row in rows:
            counts[row["label"]] = counts.get(row["label"], 0) + 1
        print(name, len(rows), counts)


main()
