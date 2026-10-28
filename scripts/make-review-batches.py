#!/usr/bin/env python3
"""Splits Latin-script chat messages tongue didn't label as English into review batches for Haiku agents.

Usage: scripts/make-review-batches.py [batch_size]
Reads eval/full.jsonl and eval/full-latin-tongue.jsonl, writes eval/review/pass-NNN.tsv, numbered
after existing batches and skipping already reviewed messages. Messages without words to judge
(urls, @mentions, /commands only) are skipped. Agent prompt: scripts/review-prompt.md.
"""

import glob
import re
import sys

from lid_data import batch_line, is_latin_message, read_jsonl

BATCH_SIZE = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
NOISE_RE = re.compile(r"\S+://\S+|@\w+|/\w+")

reviewed = set()
for path in glob.glob("eval/review/*.tsv"):
    reviewed.update(line.split("\t", 1)[0] for line in open(path, encoding="utf-8"))
existing = glob.glob("eval/review/pass-*.tsv")
first_batch = 1 + max((int(path[-7:-4]) for path in existing if not path.endswith(".out.tsv")), default=-1)

not_english = {row["id"] for row in read_jsonl("eval/full-latin-tongue.jsonl") if row["language"] != "en"}
lines, nothing_to_judge = [], 0
for msg in read_jsonl("eval/full.jsonl"):
    if msg["id"] not in not_english or msg["id"] in reviewed or not is_latin_message(msg["text"]):
        continue
    if sum(c.isalpha() for c in NOISE_RE.sub("", msg["text"])) < 2:
        nothing_to_judge += 1
        continue
    lines.append(batch_line(msg["id"], msg["text"]))

for i in range(0, len(lines), BATCH_SIZE):
    with open(f"eval/review/pass-{first_batch + i // BATCH_SIZE:03}.tsv", "w", encoding="utf-8") as f:
        f.writelines(lines[i : i + BATCH_SIZE])
print(f"{len(lines)} messages in {-(-len(lines) // BATCH_SIZE)} batches, {nothing_to_judge} with nothing to judge skipped")
