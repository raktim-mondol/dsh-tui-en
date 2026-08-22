mod app;
mod backend;
mod protocol;
mod theme;
mod ui;
mod whale;

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;

use crate::app::App;
use crate::backend::{start, BackendConfig, BackendKind};
use crate::protocol::DEFAULT_CHANNEL_ORIGIN;

/// English Ratatui client for DeepSeek Harness.
#[derive(Debug, Parser)]
#[command(name = "dsh-tui-en", version, about)]
struct Cli {
    /// Backend: auto picks API when DEEPSEEK_API_KEY is set, else TUI Channel, else demo.
    #[arg(long, env = "DSH_TUI_BACKEND", value_enum, default_value_t = BackendKind::Auto)]
    backend: BackendKind,

    /// Model id for the DeepSeek API backend.
    #[arg(long, env = "DSH_TUI_MODEL", default_value = "deepseek-chat")]
    model: String,

    /// DeepSeek-compatible API base.
    #[arg(long, env = "DEEPSEEK_BASE_URL", default_value = "https://api.deepseek.com")]
    base_url: String,

    /// TUI Channel HTTP origin (RFC 0008).
    #[arg(long, env = "DSH_TUI_CHANNEL_ORIGIN", default_value = DEFAULT_CHANNEL_ORIGIN)]
    origin: String,

    /// Workspace directory projected into the session.
    #[arg(long, env = "DSH_TUI_WORKSPACE")]
    workspace: Option<PathBuf>,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let workspace = cli
        .workspace
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    let workspace = workspace.canonicalize().unwrap_or(workspace);

    let engine = start(BackendConfig {
        kind: cli.backend,
        model: cli.model,
        api_key: std::env::var("DEEPSEEK_API_KEY").ok(),
        base_url: cli.base_url,
        channel_origin: cli.origin,
        workspace: workspace.to_string_lossy().into_owned(),
    })
    .await?;

    App::new(engine).run().await
}
