#!/usr/bin/env bash
# Samples Latin-script Tatoeba sentences (CC-BY 2.0 FR) in languages other than English and Russian,
# used as the "other" class for language identification training.
# Usage: scripts/fetch-tatoeba.sh [out_dir] [per_language]
set -eu
OUT=${1:-eval/tatoeba}
N=${2:-4000}
LANGS="afr sqi aze eus bos cat hrv ces dan nld epo est fin fra lug deu hun isl ind gle ita lat lvs lit zsm mri
nob nno pol por ron sna slk slv som sot spa swh swe tgl tso tsn tur vie cym xho yor zul uzb tok srp"
mkdir -p "$OUT"
for lang in $LANGS; do
	[ -s "$OUT/$lang.tsv" ] && continue
	curl -fsSL "https://downloads.tatoeba.org/exports/per_language/$lang/${lang}_sentences.tsv.bz2" | bzcat |
		grep -vP '\p{Cyrillic}' | shuf -n "$N" --random-source=<(yes) > "$OUT/$lang.tsv" || echo "failed: $lang" >&2
	printf '%s %s\n' "$lang" "$(wc -l < "$OUT/$lang.tsv")"
done
