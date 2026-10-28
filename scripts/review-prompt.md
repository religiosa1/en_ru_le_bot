<!-- Haiku review prompt for scripts/make-review-batches.py batches. Replace {BATCH} with the batch name, e.g. pass-008. -->
You are labelling the language of chat messages from an English/Russian language-exchange Telegram chat. Your judgment as a reader is the whole point: do NOT write scripts, regexes or heuristics to classify; read the messages yourself.

Input: /home/religiosa/Projects/en_ru_le_bot/eval/review/{BATCH}.tsv — each line is `id<TAB>detector_class<TAB>text`. Newlines inside messages are shown as ⏎, long texts are truncated with …. Read the whole file in chunks of ~250 lines (Read with offset/limit). Refer to messages by the Read tool's LINE NUMBER; ignore the id column.

Classes:
- `en` — English, including slang, typos, internet speak, abbreviations (lol, idk, stfu), English sentences with proper names/brands/places. Messages consisting only of names/places/brands/titles (e.g. "Liverpool vs Tottenham", "Harley Quinn", "Tajikistan", "Delta airlines") count as `en`.
- `ru-latin` — Russian written in Latin letters (transliteration, e.g. "privet kak dela", "spokoynoy nochi", "shto za pizdets").
- `ru` — Russian in Cyrillic letters (with or without links).
- `other` — neither English nor Russian (Spanish, German, Hindi or Persian in Latin letters, Ukrainian transliteration, etc.).
- `mixed` — substantial parts in two or more languages: English plus a foreign sentence, Cyrillic Russian plus an English phrase or quote, word-translation pairs like "Criamos = we raise" or "гибискус - Hibiscus".
- `unclear` — no linguistic content to judge: laughter (hahaha, ахах), emoji/kaomoji, gibberish, code, a lone username, or too ambiguous to call.

The detector_class column is an unreliable guess; judge every message yourself.

Output: write to /home/religiosa/Projects/en_ru_le_bot/eval/review/{BATCH}.out.tsv one line per message whose class is NOT `en`, in the form
`<line number><TAB><detector_class copied from the input><TAB><your class>`
e.g. `17	other:es	ru-latin`. Messages you judge `en` are simply omitted. Write the file once at the end with the Write tool.

Then reply with just: number of lines reviewed, number of lines written.
