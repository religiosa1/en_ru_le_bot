//! Embeds the bot version: BOT_VERSION from the build environment (e.g. for Docker builds
//! without .git), otherwise `git describe`, falling back to the Cargo.toml version.

use std::process::Command;

fn main() {
    println!("cargo:rerun-if-env-changed=BOT_VERSION");
    // Tags, commits and working tree changes
    for path in [".git/HEAD", ".git/refs", ".git/index"] {
        println!("cargo:rerun-if-changed={path}");
    }

    let version = std::env::var("BOT_VERSION")
        .ok()
        .filter(|v| !v.is_empty())
        .or_else(git_describe)
        .unwrap_or_else(|| env!("CARGO_PKG_VERSION").into());
    println!("cargo:rustc-env=BOT_VERSION={version}");
}

fn git_describe() -> Option<String> {
    let output = Command::new("git").args(["describe", "--tags", "--always", "--dirty"]).output().ok()?;
    let version = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (output.status.success() && !version.is_empty()).then_some(version)
}
