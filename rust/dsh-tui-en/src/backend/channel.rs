use anyhow::{anyhow, Context, Result};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{mpsc, watch};
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

use super::{shorten_home, BackendConfig, Engine, EngineCommand};
use crate::protocol::{
    ChannelSnapshot, ChannelView, ChatRow, NotificationItem, RowKind, API_VERSION, CHANNEL_FEATURES,
    CHANNEL_KIND, DESCRIPTOR_PATH, HEALTH_PATH, WEBSOCKET_PATH, WIRE_REVISION,
};

pub async fn health_ok(origin: &str) -> bool {
    let url = format!("{}{HEALTH_PATH}", origin.trim_end_matches('/'));
    match reqwest::Client::new().get(url).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}

pub async fn start(config: BackendConfig) -> Result<Engine> {
    let origin = config.channel_origin.trim_end_matches('/').to_string();
    let descriptor = fetch_descriptor(&origin).await.ok();
    let ws_url = websocket_url(descriptor.as_ref(), &origin)?;

    let (mut sink, mut stream) = tokio_tungstenite::connect_async(&ws_url)
        .await
        .with_context(|| format!("TUI Channel websocket {ws_url}"))?
        .0
        .split();

    let offer = local_offer();
    sink.send(Message::Text(
        serde_json::to_string(&WireOut::ConnectionOpen { offer: offer.clone() })?,
    ))
    .await?;

    wait_opened(&mut stream).await?;

    let channel_id = Uuid::new_v4().to_string();
    sink.send(Message::Text(serde_json::to_string(&WireOut::CapabilityInvoke {
        invocation_id: Uuid::new_v4().to_string(),
        reference: ApiRef {
            api_version: API_VERSION.into(),
            kind: CHANNEL_KIND.into(),
        },
        operation: "open".into(),
        input: json!({
            "workspace": format!("file://{}", config.workspace),
            "sessionId": Value::Null,
            "options": { "locale": "en" }
        }),
    })?))
    .await?;

    let cwd = config.workspace.clone();
    let mut view = ChannelView {
        backend: "channel".into(),
        model: config.model.clone(),
        cwd: cwd.clone(),
        display_cwd: shorten_home(&cwd),
        session_title: "channel".into(),
        notifications: vec![NotificationItem {
            id: 1,
            text: format!("Connected to {origin}"),
            color: Some("success".into()),
        }],
        ..ChannelView::default()
    };
    let (snap_tx, snap_rx) = watch::channel(ChannelSnapshot::new(channel_id.clone(), view.clone()));
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel();

    tokio::spawn(async move {
        let mut live_id = channel_id;
        loop {
            tokio::select! {
                cmd = cmd_rx.recv() => {
                    let Some(cmd) = cmd else { break };
                    match cmd {
                        EngineCommand::Shutdown => {
                            let _ = sink.send(Message::Text(serde_json::to_string(&WireOut::CapabilityInvoke {
                                invocation_id: Uuid::new_v4().to_string(),
                                reference: ApiRef { api_version: API_VERSION.into(), kind: CHANNEL_KIND.into() },
                                operation: "close".into(),
                                input: json!({ "channelId": live_id }),
                            }).unwrap_or_default())).await;
                            break;
                        }
                        EngineCommand::Submit(text) => {
                            view.working = true;
                            view.status = "working".into();
                            view.last_user_text = text.clone();
                            view.rows.push(ChatRow {
                                id: view.rows.len() as u64 + 1,
                                kind: RowKind::User,
                                text: text.clone(),
                                streaming: false,
                                label: None,
                                tool_name: None,
                            });
                            let _ = snap_tx.send(ChannelSnapshot::new(live_id.clone(), view.clone()));
                            let _ = sink.send(Message::Text(serde_json::to_string(&WireOut::CapabilityInvoke {
                                invocation_id: Uuid::new_v4().to_string(),
                                reference: ApiRef { api_version: API_VERSION.into(), kind: CHANNEL_KIND.into() },
                                operation: "invoke".into(),
                                input: json!({
                                    "channelId": live_id,
                                    "method": "submit",
                                    "arguments": [text]
                                }),
                            }).unwrap_or_default())).await;
                        }
                        EngineCommand::Cancel => {
                            let _ = sink.send(Message::Text(serde_json::to_string(&WireOut::CapabilityInvoke {
                                invocation_id: Uuid::new_v4().to_string(),
                                reference: ApiRef { api_version: API_VERSION.into(), kind: CHANNEL_KIND.into() },
                                operation: "invoke".into(),
                                input: json!({
                                    "channelId": live_id,
                                    "method": "cancel",
                                    "arguments": []
                                }),
                            }).unwrap_or_default())).await;
                        }
                        EngineCommand::NewSession => {
                            let _ = sink.send(Message::Text(serde_json::to_string(&WireOut::CapabilityInvoke {
                                invocation_id: Uuid::new_v4().to_string(),
                                reference: ApiRef { api_version: API_VERSION.into(), kind: CHANNEL_KIND.into() },
                                operation: "invoke".into(),
                                input: json!({
                                    "channelId": live_id,
                                    "method": "newSession",
                                    "arguments": []
                                }),
                            }).unwrap_or_default())).await;
                        }
                    }
                }
                frame = stream.next() => {
                    let Some(frame) = frame else { break };
                    let Ok(Message::Text(text)) = frame else { continue };
                    if let Ok(incoming) = serde_json::from_str::<WireIn>(&text) {
                        match incoming {
                            WireIn::CapabilityResult { output, .. } => {
                                if let Some(snapshot) = snapshot_from_output(output) {
                                    live_id = snapshot.channel_id.clone();
                                    view = snapshot.state.clone();
                                    view.backend = "channel".into();
                                    let _ = snap_tx.send(snapshot);
                                }
                            }
                            WireIn::CapabilityProgress { value, .. } => {
                                if let Ok(snapshot) = serde_json::from_value::<ChannelSnapshot>(value.clone()) {
                                    live_id = snapshot.channel_id.clone();
                                    view = snapshot.state.clone();
                                    view.backend = "channel".into();
                                    let _ = snap_tx.send(snapshot);
                                } else if let Ok(snapshot) = serde_json::from_value::<ChannelSnapshot>(value.get("snapshot").cloned().unwrap_or(Value::Null)) {
                                    live_id = snapshot.channel_id.clone();
                                    view = snapshot.state.clone();
                                    view.backend = "channel".into();
                                    let _ = snap_tx.send(snapshot);
                                }
                            }
                            WireIn::CapabilityError { message, .. } => {
                                view.notifications.push(NotificationItem {
                                    id: view.notifications.len() as u64 + 1,
                                    text: message,
                                    color: Some("error".into()),
                                });
                                let _ = snap_tx.send(ChannelSnapshot::new(live_id.clone(), view.clone()));
                            }
                            WireIn::ConnectionOpened { .. } | WireIn::Unknown => {}
                        }
                    }
                }
            }
        }
    });

    Ok(Engine {
        snapshots: snap_rx,
        commands: cmd_tx,
    })
}

fn snapshot_from_output(output: Value) -> Option<ChannelSnapshot> {
    if let Ok(snapshot) = serde_json::from_value::<ChannelSnapshot>(output.clone()) {
        return Some(snapshot);
    }
    if let Some(snapshot) = output.get("snapshot") {
        if let Ok(snapshot) = serde_json::from_value::<ChannelSnapshot>(snapshot.clone()) {
            return Some(snapshot);
        }
    }
    if let Some(state) = output.get("state") {
        if let Ok(state) = serde_json::from_value::<ChannelView>(state.clone()) {
            return Some(ChannelSnapshot::new(
                output.get("channelId").and_then(Value::as_str).unwrap_or("channel"),
                state,
            ));
        }
    }
    None
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiRef {
    api_version: String,
    kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "type")]
enum WireOut {
    #[serde(rename = "connection/open")]
    ConnectionOpen { offer: Value },
    #[serde(rename = "capability/invoke")]
    CapabilityInvoke {
        #[serde(rename = "invocationId")]
        invocation_id: String,
        reference: ApiRef,
        operation: String,
        input: Value,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum WireIn {
    #[serde(rename = "connection/opened")]
    ConnectionOpened {
        #[serde(default)]
        plan: Value,
    },
    #[serde(rename = "capability/result")]
    CapabilityResult {
        #[serde(default)]
        output: Value,
    },
    #[serde(rename = "capability/progress")]
    CapabilityProgress {
        #[serde(default)]
        value: Value,
    },
    #[serde(rename = "capability/error")]
    CapabilityError {
        #[serde(default)]
        message: String,
    },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
struct EndpointDescriptor {
    origin: String,
    connection: String,
}

async fn fetch_descriptor(origin: &str) -> Result<EndpointDescriptor> {
    let url = format!("{origin}{DESCRIPTOR_PATH}");
    let resp = reqwest::Client::new().get(url).send().await?;
    Ok(resp.json().await?)
}

fn websocket_url(descriptor: Option<&EndpointDescriptor>, origin: &str) -> Result<String> {
    let (origin, path) = match descriptor {
        Some(d) => (d.origin.as_str(), d.connection.as_str()),
        None => (origin, WEBSOCKET_PATH),
    };
    let mut url = url::Url::parse(origin).context("channel origin")?;
    match url.scheme() {
        "http" => url.set_scheme("ws").ok(),
        "https" => url.set_scheme("wss").ok(),
        other => return Err(anyhow!("unsupported origin scheme {other}")),
    };
    url.set_path(path);
    Ok(url.to_string())
}

fn local_offer() -> Value {
    json!({
        "apiVersion": "connection.dsh/v1alpha1",
        "kind": "ConnectionOffer",
        "endpoint": { "id": "dsh-tui-en", "instanceId": Uuid::new_v4().to_string() },
        "revision": 1,
        "declarations": [{
            "participant": { "id": "tui-consumer" },
            "requirements": [{
                "apiVersion": API_VERSION,
                "kind": CHANNEL_KIND,
                "spec": {
                    "wireRevision": WIRE_REVISION,
                    "features": CHANNEL_FEATURES
                }
            }]
        }]
    })
}

async fn wait_opened<S>(stream: &mut S) -> Result<WireIn>
where
    S: StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let timeout = tokio::time::timeout(std::time::Duration::from_secs(5), async {
        while let Some(msg) = stream.next().await {
            let msg = msg?;
            if let Message::Text(text) = msg {
                if let Ok(WireIn::ConnectionOpened { plan }) = serde_json::from_str(&text) {
                    return Ok(WireIn::ConnectionOpened { plan });
                }
            }
        }
        Err(anyhow!("channel closed before connection/opened"))
    })
    .await
    .map_err(|_| anyhow!("timed out waiting for connection/opened"))?;
    timeout
}
