#!/usr/bin/env python3
"""Scores pipeline verdicts (examples/lid_eval.rs --save, scripts/lid-baseline.ts) against review labels.

Usage: scripts/score-verdicts.py <sample batch>... -- <verdicts.jsonl>...
e.g.   scripts/score-verdicts.py sample-2026-0 sample-2026-1 -- eval/tongue-2026.jsonl eval/chat-2026.jsonl

Labels come from eval/review/<batch>.tsv + .out.tsv (unlisted lines are "en"). A verdict of
"ml" or "charset" means the message was flagged as another language.
"""

import collections
import json
import sys

sep = sys.argv.index("--")
batches, verdict_files = sys.argv[1:sep], sys.argv[sep + 1 :]

truth = {}
for batch in batches:
    rows = [line.split("\t", 2)[:2] for line in open(f"eval/review/{batch}.tsv", encoding="utf-8")]
    truth.update({id: "en" for id, _ in rows})
    for line in open(f"eval/review/{batch}.out.tsv", encoding="utf-8"):
        if not line.strip():
            continue
        number, check, label = line.rstrip("\n").split("\t")
        index = int(number) - 1
        if 0 <= index < len(rows) and rows[index][1] == check:
            truth[rows[index][0]] = label
        elif 0 <= index < len(rows):
            del truth[rows[index][0]]  # misaligned, unknown label

counts = collections.Counter(truth.values())
print(f"{len(truth)} labelled messages: {dict(counts.most_common())}\n")
print(f"{'verdicts':<28} {'flagged':>7}  flagged share per true label")
for path in verdict_files:
    verdicts = {}
    for line in open(path, encoding="utf-8"):
        row = json.loads(line)
        verdicts[row["id"]] = row["verdict"].split(":")[0] in ("ml", "charset")
    flagged = collections.Counter(label for id, label in truth.items() if verdicts.get(id))
    shares = ", ".join(f"{label} {flagged[label]}/{n} ({100 * flagged[label] / n:.1f}%)" for label, n in counts.most_common())
    print(f"{path:<28} {sum(flagged.values()):>7}  {shares}")
