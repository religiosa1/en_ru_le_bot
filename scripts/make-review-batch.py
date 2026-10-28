#!/usr/bin/env python3
"""Writes a review batch for given message ids, without any detector's guess.

Usage: scripts/make-review-batch.py <name> <ids file>  ->  eval/review/<name>.tsv

Lines are `id<TAB>check<TAB>text`, where check is a short hash of the text the reviewer copies
back, so line numbers can be verified. Batches named sample-* are kept for the test set.
Agent prompt: scripts/review-prompt.md.
"""

import hashlib
import json
import sys

name, ids_path = sys.argv[1], sys.argv[2]
ids = [line.strip() for line in open(ids_path, encoding="utf-8") if line.strip()]
texts = {}
for line in open("eval/full.jsonl", encoding="utf-8"):
    row = json.loads(line)
    texts[row["id"]] = row["text"]

with open(f"eval/review/{name}.tsv", "w", encoding="utf-8") as f:
    for id in ids:
        text = texts[id].replace("\t", " ").replace("\n", " ⏎ ")
        check = hashlib.md5(text.encode()).hexdigest()[:4]
        f.write(f"{id}\t{check}\t{text[:300] + '…' if len(text) > 300 else text}\n")
print(f"eval/review/{name}.tsv: {len(ids)} messages")
