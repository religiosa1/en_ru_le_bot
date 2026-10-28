# Language detection model

The bot needs to tell whether a message is written in a language other than
English or Russian. Off-the-shelf detectors were evaluated and rejected:

| Detector | Problem |
|---|---|
| tongue (TS version) | closed source; ~3× more false "other" flags than our model on 2026 messages |
| lingua-rs | 236 MiB binary even limited to Latin/Cyrillic languages; noisy on short texts |
| OpenLID (quantized `.ftz`) | many false positives on short casual English ("Interesting" → Greek) |
| fastText `lid.176` | broken in the pure-Rust `fasttext` crate (empty predictions) |

So we train our own small fastText classifier on the chat history, with labels
`en`, `ru`, `ru-latin` (transliterated Russian) and `other`. Quantized it's
~1.3 MiB; `models/lid-chat.ftz` is committed and compiled into the binary by
`src/lid.rs`, so retraining means rebuilding the bot.

## Pipeline overview

```
Telegram HTML export ──► eval/full.jsonl ──► tongue labels (Latin-script msgs)
                                          └─► Haiku review of tongue's non-English verdicts
Tatoeba (other langs) ─────────────┐
synthetic ru-latin (transliterator)┤
chat en / ru / reviewed labels ────┴─► eval/lid/{train,test}.jsonl ──► models/lid-chat.ftz
```

All intermediate data lives in `eval/`, git-ignored as it contains chat
messages. Of `models/`, only the quantized `lid-chat.ftz` is committed; the
full `lid-chat.bin` (~80 MiB) isn't.

## Step by step

1. **Corpus.** Export the chat with Telegram Desktop (HTML format), then:

   ```sh
   ls "<export dir>"/messages*.html | sort -V | tr '\n' '\0' \
     | xargs -0 python3 scripts/export-to-jsonl.py > eval/full.jsonl
   ```

   One `{"id", "date", "from", "text"}` per message, bot messages skipped.

2. **Latin-script subset + tongue labels.** Messages with ≥5 letters and more
   Latin than Cyrillic letters (`lid_data.is_latin_message`) go to
   `eval/full-latin.jsonl`, then:

   ```sh
   node scripts/tongue-label.ts eval/full-latin.jsonl > eval/full-latin-tongue.jsonl
   ```

   tongue is reliable when it says English (~99.8% in a reviewed sample) and
   unreliable otherwise, so only its non-English verdicts are reviewed.
   NOTE: tongue lived in the TS version of the bot, removed since; this script
   and `scripts/lid-baseline.ts` are available in commit `51069e9`. A new
   export could also be pre-labelled with the chat model itself instead.

3. **Review.** `scripts/make-review-batches.py` splits tongue's non-English
   Latin messages into 1000-line batches (`eval/review/pass-NNN.tsv`), skipping
   already reviewed ones and messages with nothing to judge (urls, @mentions,
   /commands). Each batch is labelled by a Haiku subagent with
   `scripts/review-prompt.md` (replace `{BATCH}`), producing
   `eval/review/pass-NNN.out.tsv`: only non-English lines, by line number, with
   the check column (a text hash) copied for alignment. Older batches have
   tongue's guess in the check column.

   `scripts/make-review-batch.py <name> <ids file>` builds a batch for any
   message ids. Batches named `sample-*` (including the random 1000-message
   pilot, `sample-pilot`) go to the test set only. Shared helpers live in
   `scripts/lid_data.py`.

   Review classes: `en`, `ru`, `ru-latin`, `other`, `mixed`, `unclear`.
   `mixed` and `unclear` are excluded from training.

   The builder collects all reviews into `eval/review-labels.tsv` (message id,
   class, pilot flag; no texts). Keep a copy of it: re-reviewing costs ~100k
   Haiku tokens per batch. If `eval/review/` is gone, the builder reads this
   file instead.

4. **Tatoeba** (CC-BY 2.0 FR) for the `other` class, ~50 Latin-script languages:

   ```sh
   scripts/fetch-tatoeba.sh   # eval/tatoeba/<lang>.tsv, 4000 sentences per language
   ```

5. **Dataset.**

   ```sh
   python3 scripts/build-lid-dataset.py   # eval/lid/{train,test}.jsonl
   ```

   - `en`: reviewed labels, otherwise tongue's `en`
   - `ru`: Cyrillic-only chat messages (60k)
   - `ru-latin`: reviewed labels + Cyrillic-only messages transliterated with a
     randomized scheme per message (60k)
   - `other`: reviewed labels + Tatoeba (90/10 split)
   - test set: messages from `TEST_YEAR` (2026), plus the random 1000-message
     pilot review sample (`eval/review/sample-pilot.*`)

6. **Train and evaluate.**

   ```sh
   cargo run --release --example lid_train            # train + quantize + per-source report
   cargo run --release --example lid_train -- <model> # evaluate an existing model
   ```

   Text goes through `lid::normalize` (lowercase, no urls/mentions, letters and
   apostrophes only) both in training and at runtime. Hyperparameters are in
   `examples/lid_train.rs`: softmax loss, dim 32, 10 epochs, lr 0.5, word
   bigrams, char n-grams 2–5; quantized with cutoff 50k, qnorm, retrain.
   Takes ~20 s.

7. **Pipeline check** against a baseline, on messages the model didn't train on:

   ```sh
   grep '"date": "2026' eval/full.jsonl > eval/corpus-2026.jsonl
   cargo run --release --example lid_eval -- eval/corpus-2026.jsonl \
     --baseline eval/tongue-2026.jsonl --save eval/chat-2026.jsonl
   ```

   Runs the full other-language check (`langday::detect_other_language`) as if
   every day were an English day, and lists every verdict change. Baselines:
   `scripts/lid-baseline.ts` (tongue pipeline, see the NOTE in step 2), or any
   earlier `--save` output.

## Results so far

2026 messages (61k), "other language" verdicts of the full pipeline:

| Detector | Flagged |
|---|---|
| tongue | 591 |
| lingua | 921 |
| chat model, no reviews | 199 |
| chat model + review wave 1 | 175 |
| chat model, all reviews | 157 |
| + capitalized names rule | 122 |

Not yet retrained on review wave 2 (pass-008–024).

Test set (quantized model, before review wave 2): `en` falsely flagged as
`other` 0.1–0.3%, Tatoeba `other` recall 99.2%, synthetic `ru-latin` 98.7%.
Real `ru-latin` reached 92% from synthetic training alone.

### Unbiased measurement

2000 random 2026 messages the bot would check (≥5 letters, any script),
reviewed without showing any detector's guess (`sample-2026-*`, test set only).
Scored with `scripts/score-verdicts.py`:

| Detector | Flagged | en wrongly flagged | ru wrongly flagged | real `other` caught |
|---|---|---|---|---|
| tongue | 17 | 6/1396 (0.4%) | 3/552 | 4/10 |
| lingua | 30 | 11/1396 (0.8%) | 9/552 | 4/10 |
| chat model (all reviews) | 10 | 1/1396 (0.07%) | 0/552 | 7/10 |

Only ~0.5% of chat messages are in another language, so recall rests on few
examples. Precision of the pipeline's own 2026 flags (`pass-025`, all reviewed):
~70% are right (other/mixed); the wrong ones are almost all lone names, places
and loanwords ("Harley Quinn", "Campinas - Brazil", "Cappuccino"). Raising the
confidence threshold trades about one true flag per false one removed. Skipping
ML when every word is capitalized would cut false flags 39 → 16 and lose 9 true
ones (all greetings like "Guten Morgen"): precision 73% → 86%. Applied, for
messages of up to 5 words (`MAX_NAME_LIST_WORDS`), so it can't be abused with
long capitalized texts: 2026 flags 157 → 122, English among them 40 → 16,
~81% of all flags right.

## Review status and cost

| Batches | Format | Haiku tokens |
|---|---|---|
| `sample-pilot` (random sample) | all mismatches, converted to `.out.tsv` | 82k |
| `pass-000`–`007` | all mismatches, converted to `.out.tsv` | 1.25M (~156k/batch) |
| `pass-008`–`015` | `.out.tsv`, non-English only | 0.79M (~98k/batch) |
| `pass-016`–`024` | `.out.tsv`, non-English only | 0.81M (~90k/batch) |
| `pass-025` (model-uncertain + pipeline flags) | `.out.tsv`, check codes | 77k |
| `sample-2026-0`, `-1` (random, unbiased) | `.out.tsv`, check codes | 166k |
| **total** | ~28k labelled messages | **~3.2M** |

All of tongue's non-English Latin-script verdicts (2019–2026) are reviewed.
Label counts: en 16.1k, mixed 4.3k, other 2.0k, unclear 1.8k, ru-latin 1.0k,
ru 0.2k (Cyrillic messages caught by the Latin filter because of long urls).
New exports only need batches for messages not in `eval/review-labels.tsv`.
NOTE: 752 of tongue's non-English verdicts (from never-reviewed pilot batches)
are still unreviewed; `make-review-batches.py` picks them up as one batch.

## Known issues and ideas

- Lone names/places and heavy slang are the main remaining false positives;
  the capitalized names rule handles most of them.
- The common-words filter in `langday.rs` still helps (removing it adds false
  positives); the 0.7 confidence threshold is untuned.
- `ru-latin` isn't used by the bot yet: transliterated Russian passes on
  English days as before. Whether to treat it as Russian is a product decision.
- Russian typed with Latin lookalike letters ("OXEPOBO") or on the wrong
  keyboard layout ("cj crblrjq") is rare and not handled.
