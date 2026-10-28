#!/usr/bin/env python3
"""Writes a review batch for given message ids.

Usage: scripts/make-review-batch.py <name> <ids file>  ->  eval/review/<name>.tsv
Batches named sample-* are kept for the test set. Agent prompt: scripts/review-prompt.md.
"""

import sys

from lid_data import batch_line, read_jsonl

name, ids_path = sys.argv[1], sys.argv[2]
ids = [line.strip() for line in open(ids_path, encoding="utf-8") if line.strip()]
texts = {row["id"]: row["text"] for row in read_jsonl("eval/full.jsonl")}
with open(f"eval/review/{name}.tsv", "w", encoding="utf-8") as f:
    f.writelines(batch_line(id, texts[id]) for id in ids)
print(f"eval/review/{name}.tsv: {len(ids)} messages")
