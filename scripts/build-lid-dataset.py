#!/usr/bin/env python3
"""Builds train/test sets for the chat language model (examples/lid_train.rs).

Usage: scripts/build-lid-dataset.py  (reads and writes under eval/)

Labels: en, ru, ru-latin, other. Sources:
- chat Latin-script messages: Haiku review verdict if reviewed (eval/review/), otherwise tongue's "en";
  tongue's non-English verdicts are unreliable and are skipped until reviewed
- chat Cyrillic-only messages: ru
- synthetic ru-latin: chat Cyrillic-only messages, transliterated with randomized schemes
- other: Tatoeba sentences (scripts/fetch-tatoeba.sh)

Chat messages from TEST_YEAR, as well as reviewed random samples (sample-*), go to the test set.
Output: eval/lid/{train,test}.jsonl, one {"label", "source", "text"} per line.
"""

import collections
import glob
import hashlib
import json
import os
import random

from lid_data import letter_counts, read_jsonl, read_review

TEST_YEAR = "2026"
REVIEW_LABELS = "eval/review-labels.tsv"
MAX_TRAIN = {"ru": 60_000, "ru-latin": 60_000}
MAX_TEST = {"en": 20_000, "ru": 5_000, "ru-latin": 5_000}

# Review classes to model labels; others (ru, mixed, unclear) are excluded,
# Cyrillic messages get their label by script instead
TRAINING_LABELS = {"en", "ru-latin", "other"}

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
    """Reviewed message labels, and ids of random samples (sample-*), which only go to the test set.

    Collected labels are saved to REVIEW_LABELS (no message texts), which is read instead
    when the review batches are gone.
    """
    labels, samples = {}, set()
    batches = sorted(glob.glob("eval/review/*.out.tsv"))
    if not batches and os.path.exists(REVIEW_LABELS):
        for line in open(REVIEW_LABELS, encoding="utf-8"):
            id, label, is_sample = line.rstrip("\n").split("\t")
            labels[id] = label
            if is_sample == "1":
                samples.add(id)
        return labels, samples
    # Sorted, so later batches override earlier labels
    for out in batches:
        batch_labels = read_review(out.removesuffix(".out.tsv") + ".tsv", out)
        labels.update(batch_labels)
        if os.path.basename(out).startswith("sample"):
            samples.update(batch_labels)
    with open(REVIEW_LABELS, "w", encoding="utf-8") as f:
        f.writelines(f"{id}\t{label}\t{int(id in samples)}\n" for id, label in sorted(labels.items()))
    return labels, samples


def main():
    rng = random.Random(42)
    reviewed, samples = review_labels()
    tongue = {row["id"]: row["language"] for row in read_jsonl("eval/full-latin-tongue.jsonl")}

    rows = {"train": [], "test": []}
    cyrillic = {"train": [], "test": []}
    for msg in read_jsonl("eval/full.jsonl"):
        text = msg["text"]
        split = "test" if msg["date"].startswith(TEST_YEAR) else "train"
        n_latin, n_cyrillic = letter_counts(text)
        if n_latin + n_cyrillic < 5:
            continue
        if n_latin == 0:
            cyrillic[split].append(text)
            continue
        if n_latin <= n_cyrillic:
            continue  # mostly Cyrillic, but not purely Russian, too ambiguous for a label
        if msg["id"] in reviewed:
            label, source = reviewed[msg["id"]], "chat-reviewed"
            if msg["id"] in samples:
                split = "test"
        elif tongue.get(msg["id"]) == "en":
            label, source = "en", "chat-tongue"
        else:
            continue
        if label in TRAINING_LABELS:
            rows[split].append({"label": label, "source": source, "text": text})

    for split, limits in (("train", MAX_TRAIN), ("test", MAX_TEST)):
        texts = cyrillic[split]
        rng.shuffle(texts)
        half = len(texts) // 2  # disjoint messages for ru and ru-latin
        rows[split] += [{"label": "ru", "source": "chat", "text": t} for t in texts[: min(half, limits["ru"])]]
        rows[split] += [
            {"label": "ru-latin", "source": "synthetic", "text": transliterate(t, rng)}
            for t in texts[half : half + limits["ru-latin"]]
        ]

    for path in sorted(glob.glob("eval/tatoeba/*.tsv")):
        for line in open(path, encoding="utf-8"):
            _, lang, text = line.rstrip("\n").split("\t", 2)
            split = "test" if stable_fraction(text) < 0.1 else "train"
            rows[split].append({"label": "other", "source": f"tatoeba-{lang}", "text": text})

    # Capping the biggest test class, keeping reviewed messages
    en_test = [r for r in rows["test"] if r["label"] == "en" and r["source"] == "chat-tongue"]
    if len(en_test) > MAX_TEST["en"]:
        drop = {id(r) for r in rng.sample(en_test, len(en_test) - MAX_TEST["en"])}
        rows["test"] = [r for r in rows["test"] if id(r) not in drop]

    os.makedirs("eval/lid", exist_ok=True)
    for split, split_rows in rows.items():
        rng.shuffle(split_rows)
        with open(f"eval/lid/{split}.jsonl", "w", encoding="utf-8") as f:
            f.writelines(json.dumps(row, ensure_ascii=False) + "\n" for row in split_rows)
        print(split, len(split_rows), dict(collections.Counter(row["label"] for row in split_rows)))


main()
