mod api;
mod channel;
mod demo;

use anyhow::Result;
use tokio::sync::{mpsc, watch};

use crate::protocol::ChannelSnapshot;

#[derive(Debug, Clone, Copy, PartialEq, Eq, clap::ValueEnum)]
pub enum BackendKind {
    Auto,
    Api,
    Channel,
    Demo,
}

#[derive(Debug, Clone)]
pub struct BackendConfig {
    pub kind: BackendKind,
    pub model: String,
    pub api_key: Option<String>,
    pub base_url: String,
    pub channel_origin: String,
    pub workspace: String,
}

pub enum EngineCommand {
    Submit(String),
    Cancel,
    NewSession,
    Shutdown,
}

pub struct Engine {
    pub snapshots: watch::Receiver<ChannelSnapshot>,
    pub commands: mpsc::UnboundedSender<EngineCommand>,
}

impl Engine {
    pub fn submit(&self, text: impl Into<String>) {
        let _ = self.commands.send(EngineCommand::Submit(text.into()));
    }

    pub fn cancel(&self) {
        let _ = self.commands.send(EngineCommand::Cancel);
    }

    pub fn new_session(&self) {
        let _ = self.commands.send(EngineCommand::NewSession);
    }

    pub fn shutdown(&self) {
        let _ = self.commands.send(EngineCommand::Shutdown);
    }
}

pub async fn start(config: BackendConfig) -> Result<Engine> {
    let kind = resolve_kind(&config).await;
    match kind {
        BackendKind::Api => api::start(config).await,
        BackendKind::Channel => channel::start(config).await,
        BackendKind::Demo => demo::start(config),
        BackendKind::Auto => unreachable!(),
    }
}

async fn resolve_kind(config: &BackendConfig) -> BackendKind {
    match config.kind {
        BackendKind::Auto => {
            if config.api_key.as_deref().unwrap_or("").trim().is_empty() {
                if channel::health_ok(&config.channel_origin).await {
                    BackendKind::Channel
                } else {
                    BackendKind::Demo
                }
            } else {
                BackendKind::Api
            }
        }
        other => other,
    }
}

pub(crate) fn git_branch(cwd: &str) -> Option<String> {
    let output = std::process::Command::new("git")
        .args(["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

pub(crate) fn shorten_home(path: &str) -> String {
    if let Some(home) = std::env::var_os("HOME") {
        let home = home.to_string_lossy();
        if let Some(rest) = path.strip_prefix(home.as_ref()) {
            return format!("~{rest}");
        }
    }
    path.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::RowKind;

    #[test]
    fn shortens_home_directory_prefix() {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/home/user".into());
        assert_eq!(shorten_home(&format!("{home}/src/dsh")), "~/src/dsh");
        assert_eq!(shorten_home("/tmp/work"), "/tmp/work");
    }

    #[tokio::test]
    async fn demo_backend_submits_then_idles() {
        let engine = demo::start(BackendConfig {
            kind: BackendKind::Demo,
            model: "deepseek-chat".into(),
            api_key: None,
            base_url: String::new(),
            channel_origin: String::new(),
            workspace: std::env::temp_dir().to_string_lossy().into_owned(),
        })
        .unwrap();

        engine.submit("ping");
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            {
                let snap = engine.snapshots.borrow().clone();
                let has_user = snap.state.rows.iter().any(|r| r.kind == RowKind::User && r.text == "ping");
                let has_assistant = snap.state.rows.iter().any(|r| r.kind == RowKind::Assistant && r.text.contains("ping"));
                if has_user && has_assistant && !snap.state.working {
                    engine.shutdown();
                    return;
                }
            }
            if tokio::time::Instant::now() > deadline {
                panic!("demo backend did not finish streaming: {:?}", engine.snapshots.borrow().state.rows);
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    }

    #[tokio::test]
    async fn auto_without_key_or_channel_selects_demo() {
        let engine = start(BackendConfig {
            kind: BackendKind::Auto,
            model: "deepseek-chat".into(),
            api_key: None,
            base_url: String::new(),
            channel_origin: "http://127.0.0.1:1".into(),
            workspace: std::env::temp_dir().to_string_lossy().into_owned(),
        })
        .await
        .unwrap();
        let backend = engine.snapshots.borrow().state.backend.clone();
        engine.shutdown();
        assert_eq!(backend, "demo");
    }
}
