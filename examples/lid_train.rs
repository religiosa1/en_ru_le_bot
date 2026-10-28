//! Trains the chat language model on eval/lid/train.jsonl and evaluates it on eval/lid/test.jsonl.
//!
//! cargo run --release --example lid_train            # train, quantize, evaluate
//! cargo run --release --example lid_train -- <model>  # only evaluate an existing model
//!
//! The dataset comes from scripts/build-lid-dataset.py. Models are written to models/.

use std::collections::BTreeMap;
use std::fs;
use std::time::Instant;

use anyhow::Context;
use en_ru_le_bot::lid::{Label, Lid, normalize};
use fasttext::FastText;
use fasttext::args::{Args, LossName, ModelName};
use serde::Deserialize;

const MODEL_BIN: &str = "models/lid-chat.bin";
const MODEL_FTZ: &str = "models/lid-chat.ftz";
/// "other" confidence thresholds to report
const THRESHOLDS: [f32; 4] = [0.5, 0.7, 0.9, 0.97];

#[derive(Deserialize)]
struct Row {
    label: String,
    source: String,
    text: String,
}

fn main() -> anyhow::Result<()> {
    let test = read_rows("eval/lid/test.jsonl")?;
    if let Some(path) = std::env::args().nth(1) {
        evaluate(&Lid::load(&path)?, &test);
        return Ok(());
    }

    let train_txt = "eval/lid/train.txt";
    let lines: Vec<String> = read_rows("eval/lid/train.jsonl")?
        .iter()
        .filter_map(|r| {
            let text = normalize(&r.text);
            (!text.is_empty()).then(|| format!("__label__{} {text}", r.label))
        })
        .collect();
    fs::write(train_txt, lines.join("\n") + "\n")?;

    let args = Args {
        input: train_txt.into(),
        model: ModelName::Supervised,
        loss: LossName::Softmax,
        dim: 32,
        epoch: 10,
        lr: 0.5,
        word_ngrams: 2,
        minn: 2,
        maxn: 5,
        bucket: 500_000,
        min_count: 2,
        thread: 8,
        verbose: 0,
        ..Args::default()
    };
    let started = Instant::now();
    let mut model = FastText::train(args.clone()).map_err(|e| anyhow::anyhow!("train: {e}"))?;
    println!("trained in {:.0?}", started.elapsed());
    fs::create_dir_all("models")?;
    model.save_model(MODEL_BIN).map_err(|e| anyhow::anyhow!("save: {e}"))?;
    println!("== full model");
    evaluate(&Lid::load(MODEL_BIN)?, &test);

    let qargs = Args { cutoff: 50_000, qnorm: true, retrain: true, epoch: 3, ..args };
    model.quantize(&qargs).map_err(|e| anyhow::anyhow!("quantize: {e}"))?;
    model.save_model(MODEL_FTZ).map_err(|e| anyhow::anyhow!("save: {e}"))?;
    for path in [MODEL_BIN, MODEL_FTZ] {
        println!("{path}: {:.1} MiB", fs::metadata(path)?.len() as f64 / 1048576.0);
    }
    println!("== quantized model");
    evaluate(&Lid::load(MODEL_FTZ)?, &test);
    Ok(())
}

/// Prints label confusion per source, and "other" verdicts at several confidence thresholds.
///
/// Goes through `Lid`, so it measures exactly what the bot runs.
fn evaluate(lid: &Lid, test: &[Row]) {
    // source -> predicted label -> count
    let mut confusion: BTreeMap<(&str, &str), BTreeMap<&str, usize>> = BTreeMap::new();
    // source -> number of "other" verdicts per threshold
    let mut other_at: BTreeMap<(&str, &str), [usize; THRESHOLDS.len()]> = BTreeMap::new();
    for row in test {
        let key = (row.label.as_str(), source_group(&row.source));
        let detection = lid.detect(&row.text);
        let label = detection.as_ref().map_or("none", |d| d.label.name());
        let counts = other_at.entry(key).or_default();
        for (i, threshold) in THRESHOLDS.iter().enumerate() {
            if detection.as_ref().is_some_and(|d| d.label == Label::Other && d.confidence >= *threshold) {
                counts[i] += 1;
            }
        }
        *confusion.entry(key).or_default().entry(label).or_default() += 1;
    }

    println!("{:<10} {:<14} {:>6}  predicted / \"other\" at {THRESHOLDS:?}", "label", "source", "total");
    for (key, predicted) in &confusion {
        let total: usize = predicted.values().sum();
        let shares: Vec<String> =
            predicted.iter().map(|(l, n)| format!("{l} {:.1}%", 100.0 * *n as f64 / total as f64)).collect();
        let other: Vec<String> = other_at[key].iter().map(|n| format!("{:.2}%", 100.0 * *n as f64 / total as f64)).collect();
        println!("{:<10} {:<14} {total:>6}  {} / {}", key.0, key.1, shares.join(", "), other.join(" "));
    }
}

fn source_group(source: &str) -> &str {
    if source.starts_with("tatoeba") { "tatoeba" } else { source }
}

fn read_rows(path: &str) -> anyhow::Result<Vec<Row>> {
    fs::read_to_string(path)
        .with_context(|| format!("read {path}"))?
        .lines()
        .map(|line| serde_json::from_str(line).with_context(|| format!("{path}: {line}")))
        .collect()
}
