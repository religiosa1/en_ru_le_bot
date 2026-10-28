#!/usr/bin/env python3
"""Splits Latin-script chat messages tongue didn't label as English into review batches for Haiku agents.

Usage: scripts/make-review-batches.py [batch_size]
Reads eval/full-latin.jsonl and eval/full-latin-tongue.jsonl, writes eval/review/pass-NNN.tsv
(`id<TAB>detector_class<TAB>text`), skipping messages already in other review batches.
Messages without words to judge (URLs, @mentions, /commands only) are written to
eval/review/auto-unclear.jsonl instead. Agent prompt: scripts/review-prompt.md.
"""

import glob
import json
import re
import sys

BATCH_SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
NOISE_RE = re.compile(r"\S+://\S+|@\w+|/\w+")
URL_RE = re.compile(r"\S+://\S+")
LATIN_RE = re.compile(r"[A-Za-z]")
CYRILLIC_RE = re.compile("[\u0400-\u04ff]")

reviewed = set()
existing = glob.glob("eval/review/pass-*.tsv")
# Numbering continues after existing batches, so reviewed ones are never overwritten
first_batch = 1 + max((int(p[-7:-4]) for p in existing), default=-1)
for path in glob.glob("eval/review/*.tsv"):
    reviewed.update(line.split("\t", 1)[0] for line in open(path, encoding="utf-8"))

texts = {}
for line in open("eval/full-latin.jsonl", encoding="utf-8"):
    row = json.loads(line)
    texts[row["id"]] = row["text"]

batch, auto_unclear = [], []
for line in open("eval/full-latin-tongue.jsonl", encoding="utf-8"):
    row = json.loads(line)
    language = row["language"]
    if language == "en" or row["id"] in reviewed:
        continue
    text = texts[row["id"]]
    no_urls = URL_RE.sub("", text)
    if len(LATIN_RE.findall(no_urls)) <= len(CYRILLIC_RE.findall(no_urls)):
        continue  # Cyrillic message with a link, it's Russian
    if sum(c.isalpha() for c in NOISE_RE.sub("", text)) < 2:
        auto_unclear.append({"id": row["id"], "detector": "unclear", "truth": "unclear", "confident": True})
        continue
    detector = "unclear" if language is None else "ru-latin" if language == "ru" else f"other:{language}"
    text = text.replace("\t", " ").replace("\n", " ⏎ ")
    batch.append(f"{row['id']}\t{detector}\t{text[:300] + '…' if len(text) > 300 else text}\n")

for i in range(0, len(batch), BATCH_SIZE):
    with open(f"eval/review/pass-{first_batch + i // BATCH_SIZE:03}.tsv", "w", encoding="utf-8") as f:
        f.writelines(batch[i : i + BATCH_SIZE])
with open("eval/review/auto-unclear.jsonl", "w", encoding="utf-8") as f:
    f.writelines(json.dumps(r) + "\n" for r in auto_unclear)
print(f"{len(batch)} messages in {-(-len(batch) // BATCH_SIZE)} batches, {len(auto_unclear)} auto-unclear")
