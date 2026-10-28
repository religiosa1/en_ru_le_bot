"""Shared helpers of the language detection data scripts: chat corpus, review batches and labels."""

import hashlib
import json
import re

URL_RE = re.compile(r"\S+://\S+")
LATIN_RE = re.compile(r"[A-Za-z]")
CYRILLIC_RE = re.compile("[Ѐ-ӿ]")

# Classes reviewers assign, see review-prompt.md
REVIEW_CLASSES = {"en", "ru", "ru-latin", "other", "mixed", "unclear"}


def read_jsonl(path: str):
    with open(path, encoding="utf-8") as f:
        for line in f:
            yield json.loads(line)


def letter_counts(text: str) -> tuple[int, int]:
    """Latin and Cyrillic letters, without urls, so a link doesn't make a Russian message Latin."""
    no_urls = URL_RE.sub("", text)
    return len(LATIN_RE.findall(no_urls)), len(CYRILLIC_RE.findall(no_urls))


def is_latin_message(text: str) -> bool:
    """Messages the model has to tell English from the rest: mostly Latin letters, at least 5 letters."""
    n_latin, n_cyrillic = letter_counts(text)
    return n_latin + n_cyrillic >= 5 and n_latin > n_cyrillic


def batch_line(id: str, text: str) -> str:
    """Review batch line `id<TAB>check<TAB>text`, check being a text hash to verify line numbers."""
    text = text.replace("\t", " ").replace("\n", " ⏎ ")
    check = hashlib.md5(text.encode()).hexdigest()[:4]
    return f"{id}\t{check}\t{text[:300] + '…' if len(text) > 300 else text}\n"


def canonical_class(label: str) -> str | None:
    """Review class with reviewer variations folded in ("other:de" -> "other"), None if unknown."""
    if label == "other:ru":  # Cyrillic Russian labelled as a foreign language
        return "ru"
    if label.startswith("other:"):
        return "other"
    return label if label in REVIEW_CLASSES else None


def read_review(tsv: str, out: str) -> dict[str, str]:
    """Labels of a review batch: the reviewer lists non-English messages by line number, everything else is "en".

    Lines whose copied second column doesn't match the batch, or with unknown classes, are skipped.
    """
    rows = [line.split("\t", 2)[:2] for line in open(tsv, encoding="utf-8")]
    labels = {id: "en" for id, _ in rows}
    skipped = 0
    for line in open(out, encoding="utf-8"):
        if not line.strip():
            continue
        number, check, label = line.rstrip("\n").split("\t")
        index = int(number) - 1
        if not 0 <= index < len(rows):
            skipped += 1
            continue
        id, expected_check = rows[index]
        label = canonical_class(label)
        if check != expected_check or label is None:
            skipped += 1
            labels.pop(id, None)  # unknown truth, can't default to "en"
        else:
            labels[id] = label
    if skipped:
        print(f"{out}: {skipped} misaligned or unknown lines skipped")
    return labels
