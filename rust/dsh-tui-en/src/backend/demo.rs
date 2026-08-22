use tokio::sync::{mpsc, watch};
use uuid::Uuid;

use super::{git_branch, shorten_home, BackendConfig, Engine, EngineCommand};
use crate::protocol::{ChannelSnapshot, ChannelView, ChatRow, RowKind, TokenUsage};

pub fn start(config: BackendConfig) -> anyhow::Result<Engine> {
    let cwd = config.workspace.clone();
    let mut view = ChannelView {
        backend: "demo".into(),
        model: config.model.clone(),
        provider: "demo".into(),
        cwd: cwd.clone(),
        display_cwd: shorten_home(&cwd),
        git_branch: git_branch(&cwd),
        session_title: "demo".into(),
        agent_id: Uuid::new_v4().to_string(),
        reasoning_effort: Some("max".into()),
        notifications: vec![crate::protocol::NotificationItem {
            id: 1,
            text: "Demo backend — no API key. Set DEEPSEEK_API_KEY or connect a TUI Channel.".into(),
            color: Some("warning".into()),
        }],
        ..ChannelView::default()
    };
    view.rows.push(ChatRow {
        id: 1,
        kind: RowKind::Notice,
        text: "dsh-tui-en demo mode. Type a prompt to see a local echo, or /help.".into(),
        streaming: false,
        label: None,
        tool_name: None,
    });

    let (snap_tx, snap_rx) = watch::channel(ChannelSnapshot::new("demo", view.clone()));
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();

    tokio::spawn(async move {
        let mut next_id = 2u64;
        while let Some(cmd) = cmd_rx.recv().await {
            match cmd {
                EngineCommand::Shutdown => break,
                EngineCommand::Cancel => {
                    view.working = false;
                    view.status = "idle".into();
                    let _ = snap_tx.send(ChannelSnapshot::new("demo", view.clone()));
                }
                EngineCommand::NewSession => {
                    view.rows.clear();
                    view.tokens = TokenUsage::default();
                    view.last_user_text.clear();
                    view.working = false;
                    view.status = "idle".into();
                    next_id = 1;
                    let _ = snap_tx.send(ChannelSnapshot::new("demo", view.clone()));
                }
                EngineCommand::Submit(text) => {
                    next_id += 1;
                    view.rows.push(ChatRow {
                        id: next_id,
                        kind: RowKind::User,
                        text: text.clone(),
                        streaming: false,
                        label: None,
                        tool_name: None,
                    });
                    view.last_user_text = text.clone();
                    view.working = true;
                    view.status = "working".into();
                    let _ = snap_tx.send(ChannelSnapshot::new("demo", view.clone()));

                    next_id += 1;
                    let assistant_id = next_id;
                    view.rows.push(ChatRow {
                        id: assistant_id,
                        kind: RowKind::Assistant,
                        text: String::new(),
                        streaming: true,
                        label: None,
                        tool_name: None,
                    });
                    let reply = demo_reply(&text);
                    for ch in reply.chars() {
                        if let Some(row) = view.rows.iter_mut().find(|r| r.id == assistant_id) {
                            row.text.push(ch);
                        }
                        view.tokens.output += 1;
                        let _ = snap_tx.send(ChannelSnapshot::new("demo", view.clone()));
                        tokio::time::sleep(std::time::Duration::from_millis(8)).await;
                    }
                    if let Some(row) = view.rows.iter_mut().find(|r| r.id == assistant_id) {
                        row.streaming = false;
                    }
                    view.working = false;
                    view.status = "idle".into();
                    view.tokens.input += text.chars().count() as u64 / 4;
                    let _ = snap_tx.send(ChannelSnapshot::new("demo", view.clone()));
                }
            }
        }
    });

    Ok(Engine {
        snapshots: snap_rx,
        commands: cmd_tx,
    })
}

fn demo_reply(prompt: &str) -> String {
    format!(
        "Demo echo (no model call).\n\nYou said:\n> {}\n\nThis Ratatui client speaks the dsh-TUI Channel protocol (tui.dsh/v1alpha1, wire revision 6) and can stream from the DeepSeek API when DEEPSEEK_API_KEY is set.",
        prompt.trim()
    )
}
