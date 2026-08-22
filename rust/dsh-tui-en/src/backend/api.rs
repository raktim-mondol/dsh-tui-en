use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use futures::StreamExt;
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use uuid::Uuid;

use super::{git_branch, shorten_home, BackendConfig, Engine, EngineCommand};
use crate::protocol::{
    ChannelSnapshot, ChannelView, ChatRow, NotificationItem, RowKind, TokenUsage, TurnUsage,
};

pub async fn start(config: BackendConfig) -> Result<Engine> {
    let api_key = config
        .api_key
        .clone()
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| anyhow!("DEEPSEEK_API_KEY is not set"))?;
    let cwd = config.workspace.clone();
    let mut view = ChannelView {
        backend: "api".into(),
        model: config.model.clone(),
        provider: "deepseek".into(),
        cwd: cwd.clone(),
        display_cwd: shorten_home(&cwd),
        git_branch: git_branch(&cwd),
        session_title: "api".into(),
        agent_id: Uuid::new_v4().to_string(),
        reasoning_effort: Some("max".into()),
        notifications: vec![NotificationItem {
            id: 1,
            text: format!("DeepSeek API · {}", config.model),
            color: Some("success".into()),
        }],
        ..ChannelView::default()
    };

    let (snap_tx, snap_rx) = watch::channel(ChannelSnapshot::new("api", view.clone()));
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();
    let client = reqwest::Client::new();
    let mut history: Vec<Value> = Vec::new();
    let cancel = Arc::new(AtomicBool::new(false));

    tokio::spawn(async move {
        let mut next_id = 1u64;
        while let Some(cmd) = cmd_rx.recv().await {
            match cmd {
                EngineCommand::Shutdown => break,
                EngineCommand::Cancel => {
                    cancel.store(true, Ordering::SeqCst);
                    view.working = false;
                    view.status = "idle".into();
                    view.rows.push(ChatRow {
                        id: {
                            next_id += 1;
                            next_id
                        },
                        kind: RowKind::Interrupt,
                        text: "Interrupted.".into(),
                        streaming: false,
                        label: None,
                        tool_name: None,
                    });
                    let _ = snap_tx.send(ChannelSnapshot::new("api", view.clone()));
                }
                EngineCommand::NewSession => {
                    history.clear();
                    view.rows.clear();
                    view.tokens = TokenUsage::default();
                    view.last_usage = None;
                    view.last_user_text.clear();
                    view.working = false;
                    view.status = "idle".into();
                    next_id = 1;
                    let _ = snap_tx.send(ChannelSnapshot::new("api", view.clone()));
                }
                EngineCommand::Submit(text) => {
                    cancel.store(false, Ordering::SeqCst);
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
                    view.spinner_mode = "responding".into();
                    let _ = snap_tx.send(ChannelSnapshot::new("api", view.clone()));

                    history.push(json!({"role": "user", "content": text}));
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
                    let reasoning_id = {
                        next_id += 1;
                        next_id
                    };

                    let started = std::time::Instant::now();
                    match stream_completion(
                        &client,
                        &config.base_url,
                        &api_key,
                        &config.model,
                        &history,
                        &snap_tx,
                        &mut view,
                        assistant_id,
                        reasoning_id,
                        &cancel,
                    )
                    .await
                    {
                        Ok(answer) => {
                            if let Some(row) = view.rows.iter_mut().find(|r| r.id == assistant_id) {
                                row.streaming = false;
                                if row.text.is_empty() {
                                    row.text = answer.clone();
                                }
                            }
                            if !answer.is_empty() {
                                history.push(json!({"role": "assistant", "content": answer}));
                            }
                            let secs = started.elapsed().as_secs_f64().max(0.001);
                            let out = view
                                .rows
                                .iter()
                                .find(|r| r.id == assistant_id)
                                .map(|r| r.text.chars().count() as u64)
                                .unwrap_or(0);
                            view.tps = Some((out as f64 / 4.0) / secs);
                            view.tokens.output += out / 4;
                            view.tokens.input += text_len_tokens(&text);
                            view.last_usage = Some(TurnUsage {
                                input: text_len_tokens(&text),
                                output: out / 4,
                                cache_read: 0,
                                cache_write: 0,
                            });
                        }
                        Err(err) => {
                            view.rows.push(ChatRow {
                                id: {
                                    next_id += 1;
                                    next_id
                                },
                                kind: RowKind::Notice,
                                text: format!("API error: {err}"),
                                streaming: false,
                                label: None,
                                tool_name: None,
                            });
                            history.pop();
                        }
                    }
                    view.working = false;
                    view.status = "idle".into();
                    view.spinner_mode = "idle".into();
                    let _ = snap_tx.send(ChannelSnapshot::new("api", view.clone()));
                }
            }
        }
    });

    Ok(Engine {
        snapshots: snap_rx,
        commands: cmd_tx,
    })
}

fn text_len_tokens(text: &str) -> u64 {
    (text.chars().count() as u64 / 4).max(1)
}

#[allow(clippy::too_many_arguments)]
async fn stream_completion(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    history: &[Value],
    snap_tx: &watch::Sender<ChannelSnapshot>,
    view: &mut ChannelView,
    assistant_id: u64,
    reasoning_id: u64,
    cancel: &AtomicBool,
) -> Result<String> {
    let url = format!("{}/v1/chat/completions", base_url.trim_end_matches('/'));
    let response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&json!({
            "model": model,
            "messages": history,
            "stream": true,
        }))
        .send()
        .await
        .context("DeepSeek request failed")?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(anyhow!("HTTP {status}: {body}"));
    }

    let mut stream = response.bytes_stream();
    let mut buf = String::new();
    let mut answer = String::new();
    let mut saw_reasoning = false;

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let chunk = chunk.context("stream read")?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find("\n\n") {
            let frame = buf[..idx].to_string();
            buf = buf[idx + 2..].to_string();
            for line in frame.lines() {
                let data = match line.strip_prefix("data:") {
                    Some(rest) => rest.trim(),
                    None => continue,
                };
                if data.is_empty() || data == "[DONE]" {
                    continue;
                }
                let value: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let delta = &value["choices"][0]["delta"];
                if let Some(reason) = delta["reasoning_content"].as_str() {
                    if !reason.is_empty() {
                        if !saw_reasoning {
                            saw_reasoning = true;
                            view.rows.push(ChatRow {
                                id: reasoning_id,
                                kind: RowKind::Reasoning,
                                text: String::new(),
                                streaming: true,
                                label: None,
                                tool_name: None,
                            });
                        }
                        if let Some(row) = view.rows.iter_mut().find(|r| r.id == reasoning_id) {
                            row.text.push_str(reason);
                        }
                    }
                }
                if let Some(content) = delta["content"].as_str() {
                    if !content.is_empty() {
                        answer.push_str(content);
                        if let Some(row) = view.rows.iter_mut().find(|r| r.id == assistant_id) {
                            row.text.push_str(content);
                        }
                    }
                }
            }
            let _ = snap_tx.send(ChannelSnapshot::new("api", view.clone()));
        }
    }
    if let Some(row) = view.rows.iter_mut().find(|r| r.id == reasoning_id) {
        row.streaming = false;
    }
    Ok(answer)
}
