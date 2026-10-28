//! Runs the other-language pipeline over a message corpus and compares it against a baseline.
//!
//! cargo run --release --example lid_eval -- eval/corpus.jsonl [--baseline eval/tongue.jsonl] [--save eval/current.jsonl] [--model <other model>]
//!
//! Corpus comes from scripts/export-to-jsonl.py. Every message is checked as if it's an English day,
//! as that exercises all detection paths (Russian days only use the charset check).
//! Verdicts: "skip" (too short), "ok", "charset", "ml:<confidence>".

use std::collections::{BTreeMap, HashMap};
use std::fs;

use anyhow::Context;
use en_ru_le_bot::langday::{Lang, OtherLang, detect_other_language, strip_non_letter_or_whitespace_chars};
use en_ru_le_bot::lid::Lid;
use serde::{Deserialize, Serialize};

/// Same as the minimal message length in the language check middleware
const MIN_MSG_LENGTH: usize = 5;

#[derive(Deserialize)]
struct Message {
    id: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
struct Decision {
    id: String,
    verdict: String,
}

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let flag = |name: &str| args.iter().position(|a| a == name).and_then(|i| args.get(i + 1));
    let corpus_path = args.first().filter(|a| !a.starts_with("--")).context("corpus path is required")?;

    let messages: Vec<Message> = read_jsonl(corpus_path)?;
    let lid = match flag("--model") {
        Some(path) => Lid::load(path)?,
        None => Lid::embedded()?,
    };
    let decisions: Vec<Decision> = messages
        .iter()
        .map(|m| {
            let cleaned = strip_non_letter_or_whitespace_chars(&m.text);
            let verdict = if cleaned.chars().count() < MIN_MSG_LENGTH {
                "skip".into()
            } else {
                match detect_other_language(&lid, &m.text, Some(Lang::En)) {
                    None => "ok".into(),
                    Some(OtherLang::Charset) => "charset".into(),
                    Some(OtherLang::Ml { confidence, .. }) => format!("ml:{confidence:.2}"),
                }
            };
            Decision { id: m.id.clone(), verdict }
        })
        .collect();

    if let Some(path) = flag("--save") {
        let lines: Vec<String> = decisions.iter().map(serde_json::to_string).collect::<Result<_, _>>()?;
        fs::write(path, lines.join("\n") + "\n").with_context(|| format!("write {path}"))?;
    }

    println!("current: {:?}", count_categories(decisions.iter().map(|d| &d.verdict)));
    let Some(baseline_path) = flag("--baseline") else {
        return Ok(());
    };
    let baseline: HashMap<String, String> =
        read_jsonl::<Decision>(baseline_path)?.into_iter().map(|d| (d.id, d.verdict)).collect();
    println!("baseline: {:?}", count_categories(baseline.values()));

    let texts: HashMap<&str, &str> = messages.iter().map(|m| (m.id.as_str(), m.text.as_str())).collect();
    let mut disagreements: Vec<(&str, &str, &Decision)> = decisions
        .iter()
        .filter_map(|d| Some((baseline.get(&d.id)?.as_str(), d)))
        .filter(|(old, d)| category(old) != category(&d.verdict))
        .map(|(old, d)| (category(old), old, d))
        .collect();
    disagreements.sort_by_key(|(old_category, _, d)| (*old_category, category(&d.verdict)));

    let mut transitions: BTreeMap<(&str, &str), usize> = BTreeMap::new();
    for (old_category, old, d) in &disagreements {
        *transitions.entry((old_category, category(&d.verdict))).or_default() += 1;
        println!("{}\t{old} -> {}\t{}", d.id, d.verdict, texts[d.id.as_str()].replace('\n', " "));
    }
    println!("\ndisagreements (baseline -> current):");
    for ((from, to), count) in transitions {
        println!("  {from} -> {to}: {count}");
    }
    Ok(())
}

/// Verdict without the detected language
fn category(verdict: &str) -> &str {
    verdict.split(':').next().unwrap()
}

fn count_categories<'a>(verdicts: impl Iterator<Item = &'a String>) -> BTreeMap<&'a str, usize> {
    let mut counts = BTreeMap::new();
    for verdict in verdicts {
        *counts.entry(category(verdict)).or_default() += 1;
    }
    counts
}

fn read_jsonl<T: for<'de> Deserialize<'de>>(path: &str) -> anyhow::Result<Vec<T>> {
    fs::read_to_string(path)
        .with_context(|| format!("read {path}"))?
        .lines()
        .enumerate()
        .map(|(i, line)| serde_json::from_str(line).with_context(|| format!("{path}:{}", i + 1)))
        .collect()
}
