# dsh-tui-en (Rust)

English **Ratatui** terminal client for DeepSeek Harness. It is a new front
door, not a line-by-line port of the TypeScript Cordis plugin.

The TypeScript `dsh-tui` still runs **inside** the Node `dsh` process. This
binary is a standalone renderer that can:

1. Stream from the **DeepSeek API** (`DEEPSEEK_API_KEY`)
2. Connect to a **TUI Channel** HTTP endpoint (`tui.dsh/v1alpha1`, [RFC 0008](../../dsh-ecosystem-spec/rfc/0008-tui-channel-http.md), default `127.0.0.1:10721`)
3. Run a local **demo** when neither is available

## Install

```sh
# Rust 1.75+ (Ubuntu: sudo apt install rustc cargo)
cd rust/dsh-tui-en
cargo run --release
```

Install the binary:

```sh
cargo install --path rust/dsh-tui-en
dsh-tui-en
```

## Usage

```sh
export DEEPSEEK_API_KEY='your-key'
dsh-tui-en                  # API backend
dsh-tui-en --backend demo   # no network
dsh-tui-en --backend channel --origin http://127.0.0.1:10721
dsh-tui-en --model deepseek-reasoner
```

`@deepseek-ai/dsh` is still the official harness CLI. This crate does not
replace it. When a Channel provider is listening, the Rust UI is only the
consumer; agent, tools, and session logs stay on the `dsh` side.

## Keys

| Key | Action |
|---|---|
| Enter | Send prompt |
| Ctrl+C | Cancel a turn; quit if idle and the input is empty |
| Ctrl+D | Quit |
| /help | Command list |
| /new | New conversation |
| Tab | Complete a slash command |
| PgUp / PgDn | Scroll the transcript |

## Layout

Header (pixel whale + wordmark), streaming transcript, context bar, model /
token / cwd footer, and a bordered prompt — the same chrome language as the
TypeScript TUI, drawn with Ratatui instead of Ink/Yoga.
