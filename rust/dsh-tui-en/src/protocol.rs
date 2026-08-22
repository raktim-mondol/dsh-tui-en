//! Serializable TUI Channel snapshot (RFC 0007, wire revision 6).

use serde::{Deserialize, Serialize};

pub const WIRE_REVISION: u32 = 6;
pub const API_VERSION: &str = "tui.dsh/v1alpha1";
pub const CHANNEL_KIND: &str = "Channel";
pub const DEFAULT_CHANNEL_ORIGIN: &str = "http://127.0.0.1:10721";
pub const HEALTH_PATH: &str = "/dsh-tui/v1/health";
pub const DESCRIPTOR_PATH: &str = "/dsh-tui/v1/endpoint";
pub const WEBSOCKET_PATH: &str = "/dsh-tui/v1/connection";

pub const CHANNEL_FEATURES: &[&str] = &[
    "commands",
    "credentials",
    "diagnostics",
    "files",
    "models",
    "modes",
    "presets",
    "presentation",
    "provider-setup",
    "scenes",
    "session-history",
    "session-input",
    "session-lifecycle",
    "session-state",
    "settings",
    "skills",
    "subagents",
    "trace",
    "workspaces",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChannelSnapshot {
    pub wire_revision: u32,
    pub channel_id: String,
    pub version: u64,
    pub state: ChannelView,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChannelView {
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub rows: Vec<ChatRow>,
    #[serde(default)]
    pub session_title: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub display_cwd: String,
    #[serde(default)]
    pub git_branch: Option<String>,
    #[serde(default)]
    pub working: bool,
    #[serde(default)]
    pub spinner_mode: String,
    #[serde(default)]
    pub last_user_text: String,
    #[serde(default)]
    pub reasoning_effort: Option<String>,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub tokens: TokenUsage,
    #[serde(default)]
    pub last_usage: Option<TurnUsage>,
    #[serde(default)]
    pub tps: Option<f64>,
    #[serde(default)]
    pub notifications: Vec<NotificationItem>,
    #[serde(default)]
    pub backend: String,
}

impl Default for ChannelView {
    fn default() -> Self {
        Self {
            status: "idle".into(),
            rows: Vec::new(),
            session_title: "workspace".into(),
            agent_id: String::new(),
            model: "deepseek-chat".into(),
            provider: "deepseek".into(),
            cwd: String::new(),
            display_cwd: String::new(),
            git_branch: None,
            working: false,
            spinner_mode: "idle".into(),
            last_user_text: String::new(),
            reasoning_effort: Some("max".into()),
            context_window: Some(128_000),
            tokens: TokenUsage::default(),
            last_usage: None,
            tps: None,
            notifications: Vec::new(),
            backend: "demo".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ChatRow {
    pub id: u64,
    pub kind: RowKind,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub streaming: bool,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub tool_name: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum RowKind {
    User,
    Assistant,
    Tool,
    Notice,
    Reasoning,
    Interrupt,
    Local,
    #[serde(rename = "local-output")]
    LocalOutput,
    Compact,
    Subagent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TokenUsage {
    #[serde(default)]
    pub input: u64,
    #[serde(default)]
    pub output: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct TurnUsage {
    #[serde(default)]
    pub input: u64,
    #[serde(default)]
    pub output: u64,
    #[serde(default)]
    pub cache_read: u64,
    #[serde(default)]
    pub cache_write: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NotificationItem {
    pub id: u64,
    pub text: String,
    #[serde(default)]
    pub color: Option<String>,
}

impl ChannelSnapshot {
    pub fn new(channel_id: impl Into<String>, state: ChannelView) -> Self {
        Self {
            wire_revision: WIRE_REVISION,
            channel_id: channel_id.into(),
            version: state_version(&state),
            state,
        }
    }
}

fn state_version(state: &ChannelView) -> u64 {
    let mut n = state.rows.len() as u64;
    n = n.saturating_add(if state.working { 1 } else { 0 });
    n = n.saturating_add(state.tokens.input + state.tokens.output);
    n
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_conformance_snapshot_shape() {
        let json = r#"{
            "wireRevision": 6,
            "channelId": "channel-1",
            "version": 3,
            "state": {
                "status": "idle",
                "rows": [],
                "sessionTitle": "workspace"
            }
        }"#;
        let snap: ChannelSnapshot = serde_json::from_str(json).unwrap();
        assert_eq!(snap.channel_id, "channel-1");
        assert_eq!(snap.wire_revision, 6);
        assert_eq!(snap.state.status, "idle");
    }

    #[test]
    fn round_trips_chat_rows() {
        let mut state = ChannelView::default();
        state.rows.push(ChatRow {
            id: 7,
            kind: RowKind::Assistant,
            text: "ok".into(),
            streaming: true,
            label: None,
            tool_name: None,
        });
        let snap = ChannelSnapshot::new("ch", state);
        let json = serde_json::to_string(&snap).unwrap();
        let back: ChannelSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(back.state.rows[0].kind, RowKind::Assistant);
        assert!(back.state.rows[0].streaming);
        assert_eq!(back.wire_revision, WIRE_REVISION);
    }

    #[test]
    fn features_are_unique_and_non_empty() {
        let set: std::collections::BTreeSet<_> = CHANNEL_FEATURES.iter().copied().collect();
        assert_eq!(set.len(), CHANNEL_FEATURES.len());
        assert!(CHANNEL_FEATURES.contains(&"session-input"));
        assert!(CHANNEL_FEATURES.contains(&"session-state"));
    }
}
