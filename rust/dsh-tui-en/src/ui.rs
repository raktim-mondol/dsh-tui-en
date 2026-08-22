use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, Paragraph, Wrap};
use ratatui::Frame;
use unicode_width::UnicodeWidthStr;

use crate::protocol::{ChannelSnapshot, ChatRow, RowKind};
use crate::theme;
use crate::whale::{whale_height, whale_lines, whale_width};

pub const BUILTIN_COMMANDS: &[(&str, &str)] = &[
    ("new", "Start a new conversation"),
    ("clear", "Clear the conversation (alias of /new)"),
    ("help", "Show keyboard shortcuts"),
    ("status", "Show session status"),
    ("model", "Set model: /model deepseek-chat"),
    ("quit", "Exit dsh-tui-en"),
    ("btw", "Ask a side question (sent as a normal turn here)"),
];

pub struct ViewModel<'a> {
    pub snapshot: &'a ChannelSnapshot,
    pub input: &'a str,
    pub cursor: usize,
    pub scroll: u16,
    pub spinner: usize,
    pub help: bool,
    pub version: &'static str,
}

pub fn draw(frame: &mut Frame, vm: ViewModel<'_>) {
    let area = frame.area();
    let show_whale = area.width >= 72 && area.height >= 22;
    let header_h = if show_whale { whale_height().saturating_add(1) } else { 4 };
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(header_h),
            Constraint::Min(4),
            Constraint::Length(3),
            Constraint::Length(3),
            Constraint::Length(1),
        ])
        .split(area);

    draw_header(frame, chunks[0], &vm, show_whale);
    draw_transcript(frame, chunks[1], &vm);
    draw_status(frame, chunks[2], &vm);
    draw_input(frame, chunks[3], &vm);
    draw_hint(frame, chunks[4], &vm);

    if vm.help {
        draw_help(frame, area);
    } else if vm.input.starts_with('/') {
        draw_completions(frame, chunks[3], vm.input);
    }
}

fn draw_header(frame: &mut Frame, area: Rect, vm: &ViewModel<'_>, show_whale: bool) {
    let state = &vm.snapshot.state;
    if show_whale {
        let cols = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(whale_width() + 1), Constraint::Min(20)])
            .split(area);
        frame.render_widget(Paragraph::new(whale_lines()), cols[0]);
        frame.render_widget(Paragraph::new(header_text(vm, state, true)), cols[1]);
    } else {
        frame.render_widget(Paragraph::new(header_text(vm, state, false)), area);
    }
}

fn header_text<'a>(
    vm: &ViewModel<'a>,
    state: &'a crate::protocol::ChannelView,
    tall: bool,
) -> Vec<Line<'a>> {
    let mut lines = vec![Line::from(vec![
        Span::styled("✦ dsh-TUI-en", theme::bold_brand()),
        Span::raw("  "),
        Span::styled(format!("v{}", vm.version), theme::dim()),
        Span::raw("  "),
        Span::styled(state.backend.as_str(), theme::subtle()),
    ])];
    if tall {
        lines.push(Line::from(Span::styled("DEEPSEEK HARNESS", theme::brand())));
        lines.push(Line::from(Span::styled(
            "English Ratatui client",
            Style::default().fg(theme::BRAND_ICE),
        )));
    }
    lines.push(Line::from(vec![
        Span::styled(state.model.as_str(), theme::text()),
        Span::styled(" · ", theme::subtle()),
        Span::styled(
            state.reasoning_effort.as_deref().unwrap_or("max"),
            theme::dim(),
        ),
        Span::styled(" · ", theme::subtle()),
        Span::styled(
            if state.display_cwd.is_empty() {
                state.cwd.as_str()
            } else {
                state.display_cwd.as_str()
            },
            theme::dim(),
        ),
    ]));
    if let Some(branch) = &state.git_branch {
        lines.push(Line::from(Span::styled(
            format!("git:{branch}"),
            theme::subtle(),
        )));
    }
    lines.push(Line::from(Span::styled(
        "Welcome back · enter a prompt, or /help",
        Style::default().fg(theme::BRAND_ICE),
    )));
    lines
}

fn draw_transcript(frame: &mut Frame, area: Rect, vm: &ViewModel<'_>) {
    let mut lines: Vec<Line> = Vec::new();
    for row in &vm.snapshot.state.rows {
        lines.extend(render_row(row, vm.spinner));
        lines.push(Line::from(""));
    }
    if vm.snapshot.state.working {
        let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        lines.push(Line::from(Span::styled(
            format!("{} working…", frames[vm.spinner % frames.len()]),
            theme::brand(),
        )));
    }
    let paragraph = Paragraph::new(lines)
        .wrap(Wrap { trim: false })
        .scroll((vm.scroll, 0));
    frame.render_widget(paragraph, area);
}

fn render_row(row: &ChatRow, spinner: usize) -> Vec<Line<'_>> {
    match row.kind {
        RowKind::User => vec![Line::from(vec![
            Span::styled("❯ ", theme::brand()),
            Span::styled(row.text.as_str(), theme::user()),
        ])],
        RowKind::Assistant => {
            let prefix = if row.streaming {
                let frames = ["✦", "✧", "✦", "✧"];
                frames[spinner % frames.len()]
            } else {
                "✦"
            };
            wrap_prefixed(prefix, &row.text, theme::assistant())
        }
        RowKind::Reasoning => wrap_prefixed("·", &row.text, theme::reasoning()),
        RowKind::Tool => vec![Line::from(Span::styled(
            format!(
                "⏺ {} {}",
                row.tool_name.as_deref().unwrap_or("tool"),
                row.text
            ),
            theme::tool(),
        ))],
        RowKind::Notice | RowKind::Local | RowKind::LocalOutput | RowKind::Compact => {
            vec![Line::from(Span::styled(row.text.as_str(), theme::dim()))]
        }
        RowKind::Interrupt => vec![Line::from(Span::styled(row.text.as_str(), theme::warning()))],
        RowKind::Subagent => vec![Line::from(Span::styled(
            format!("⎇ {}", row.text),
            theme::warning(),
        ))],
    }
}

fn wrap_prefixed<'a>(prefix: &'a str, text: &'a str, style: Style) -> Vec<Line<'a>> {
    if text.is_empty() {
        return vec![Line::from(Span::styled(prefix, style))];
    }
    text.lines()
        .enumerate()
        .map(|(i, line)| {
            if i == 0 {
                Line::from(vec![
                    Span::styled(format!("{prefix} "), style),
                    Span::styled(line, theme::text()),
                ])
            } else {
                Line::from(vec![
                    Span::raw("  "),
                    Span::styled(line, theme::text()),
                ])
            }
        })
        .collect()
}

fn draw_status(frame: &mut Frame, area: Rect, vm: &ViewModel<'_>) {
    let state = &vm.snapshot.state;
    let used = state
        .last_usage
        .as_ref()
        .map(|u| u.input + u.cache_read + u.cache_write)
        .unwrap_or(state.tokens.input + state.tokens.output);
    let window = state.context_window.unwrap_or(128_000).max(1);
    let pct = ((used as f64 / window as f64) * 100.0).clamp(0.0, 100.0);
    let bar_w = area.width.saturating_sub(16) as usize;
    let fill = ((pct / 100.0) * bar_w as f64).round() as usize;
    let bar = format!("{}{}", "█".repeat(fill.min(bar_w)), "░".repeat(bar_w.saturating_sub(fill)));

    let notify = state.notifications.last();
    let notify_style = match notify.and_then(|n| n.color.as_deref()) {
        Some("error") => theme::error(),
        Some("success") => theme::success(),
        Some("warning") => theme::warning(),
        _ => theme::dim(),
    };
    let notify_text = notify.map(|n| n.text.as_str()).unwrap_or("");
    let tps = state
        .tps
        .map(|t| format!(" · {t:.0} tps"))
        .unwrap_or_default();
    let branch = state
        .git_branch
        .as_deref()
        .map(|b| format!(" · {b}"))
        .unwrap_or_default();

    let lines = vec![
        Line::from(vec![
            Span::styled(bar, theme::brand()),
            Span::styled(format!(" {pct:.0}% ctx"), theme::dim()),
        ]),
        Line::from(vec![
            Span::styled(state.model.as_str(), theme::text()),
            Span::styled(
                format!(
                    " · {}/{} tok{tps} · {}{branch}",
                    state.tokens.input,
                    state.tokens.output,
                    if state.display_cwd.is_empty() {
                        state.cwd.as_str()
                    } else {
                        state.display_cwd.as_str()
                    }
                ),
                theme::dim(),
            ),
        ]),
        Line::from(Span::styled(notify_text, notify_style)),
    ];
    frame.render_widget(Paragraph::new(lines), area);
}

fn draw_input(frame: &mut Frame, area: Rect, vm: &ViewModel<'_>) {
    let title = if vm.snapshot.state.working {
        " working · ctrl+c cancel "
    } else {
        " prompt "
    };
    let block = Block::default()
        .borders(Borders::ALL)
        .border_style(Style::default().fg(theme::PROMPT_BORDER))
        .title(Span::styled(title, theme::dim()));
    let inner = block.inner(area);
    frame.render_widget(block, area);

    let prefix = "> ";
    let line = format!("{prefix}{}", vm.input);
    frame.render_widget(Paragraph::new(Line::from(Span::styled(line, theme::text()))), inner);

    let prefix_w = UnicodeWidthStr::width(prefix) as u16;
    let cursor_w = UnicodeWidthStr::width(&vm.input[..vm.cursor.min(vm.input.len())]) as u16;
    let x = inner.x.saturating_add(prefix_w).saturating_add(cursor_w);
    if x < inner.x.saturating_add(inner.width) {
        frame.set_cursor_position((x, inner.y));
    }
}

fn draw_hint(frame: &mut Frame, area: Rect, vm: &ViewModel<'_>) {
    let text = if vm.help {
        "esc close help"
    } else {
        "enter send · ctrl+c cancel/quit · /help · /new · pgup/pgdn scroll"
    };
    frame.render_widget(Paragraph::new(Span::styled(text, theme::subtle())), area);
}

fn draw_help(frame: &mut Frame, area: Rect) {
    let popup = centered(area, 64, 16);
    frame.render_widget(Clear, popup);
    let mut lines = vec![Line::from(Span::styled(
        "shortcuts",
        theme::bold_brand().add_modifier(Modifier::UNDERLINED),
    ))];
    for (name, desc) in BUILTIN_COMMANDS {
        lines.push(Line::from(vec![
            Span::styled(format!("/{name:<8}"), theme::brand()),
            Span::styled(*desc, theme::text()),
        ]));
    }
    lines.push(Line::from(""));
    lines.push(Line::from(Span::styled(
        "ctrl+c  cancel turn, or quit when idle and input is empty",
        theme::dim(),
    )));
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme::BRAND))
                .title(" help "),
        ),
        popup,
    );
}

fn draw_completions(frame: &mut Frame, input_area: Rect, input: &str) {
    let query = input.trim_start_matches('/').to_ascii_lowercase();
    let hits: Vec<(&str, &str)> = BUILTIN_COMMANDS
        .iter()
        .copied()
        .filter(|(name, _)| name.starts_with(&query) || query.is_empty())
        .collect();
    if hits.is_empty() {
        return;
    }
    let height = (hits.len() as u16).saturating_add(2).min(10);
    let y = input_area.y.saturating_sub(height);
    let popup = Rect {
        x: input_area.x,
        y,
        width: input_area.width.min(56),
        height,
    };
    frame.render_widget(Clear, popup);
    let lines: Vec<Line> = hits
        .into_iter()
        .map(|(name, desc)| {
            Line::from(vec![
                Span::styled(format!("/{name:<8}"), theme::brand()),
                Span::styled(desc, theme::dim()),
            ])
        })
        .collect();
    frame.render_widget(
        Paragraph::new(lines).block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(theme::BRAND_ICE))
                .title(" commands "),
        ),
        popup,
    );
}

fn centered(area: Rect, width: u16, height: u16) -> Rect {
    let width = width.min(area.width);
    let height = height.min(area.height);
    Rect {
        x: area.x + (area.width.saturating_sub(width)) / 2,
        y: area.y + (area.height.saturating_sub(height)) / 2,
        width,
        height,
    }
}

pub fn complete_slash(input: &str) -> Option<String> {
    let query = input.trim_start_matches('/').to_ascii_lowercase();
    let mut hits = BUILTIN_COMMANDS
        .iter()
        .map(|(n, _)| *n)
        .filter(|n| n.starts_with(&query));
    let first = hits.next()?;
    if hits.next().is_some() {
        return Some(format!("/{query}"));
    }
    Some(format!("/{first} "))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::{ChannelSnapshot, ChannelView, ChatRow, RowKind};
    use ratatui::backend::TestBackend;
    use ratatui::Terminal;

    #[test]
    fn completes_unique_slash_prefix() {
        assert_eq!(complete_slash("/hel").as_deref(), Some("/help "));
        assert_eq!(complete_slash("/quit").as_deref(), Some("/quit "));
        assert_eq!(complete_slash("/n").as_deref(), Some("/new "));
    }

    #[test]
    fn leaves_ambiguous_slash_prefix() {
        assert_eq!(complete_slash("/").as_deref(), Some("/"));
        assert!(complete_slash("/nope").is_none());
    }

    #[test]
    fn draws_wordmark_and_prompt_on_test_backend() {
        let mut terminal = Terminal::new(TestBackend::new(100, 32)).unwrap();
        let mut state = ChannelView {
            backend: "demo".into(),
            model: "deepseek-chat".into(),
            display_cwd: "~/proj".into(),
            ..ChannelView::default()
        };
        state.rows.push(ChatRow {
            id: 1,
            kind: RowKind::User,
            text: "hello from test".into(),
            streaming: false,
            label: None,
            tool_name: None,
        });
        state.rows.push(ChatRow {
            id: 2,
            kind: RowKind::Assistant,
            text: "hi".into(),
            streaming: false,
            label: None,
            tool_name: None,
        });
        let snapshot = ChannelSnapshot::new("test", state);
        terminal
            .draw(|frame| {
                draw(
                    frame,
                    ViewModel {
                        snapshot: &snapshot,
                        input: "hello",
                        cursor: 5,
                        scroll: 0,
                        spinner: 0,
                        help: false,
                        version: "0.1.0",
                    },
                );
            })
            .unwrap();
        let buffer = terminal.backend().buffer().clone();
        let rendered: String = buffer
            .content()
            .iter()
            .map(|cell| cell.symbol().to_string())
            .collect();
        assert!(rendered.contains("dsh-TUI-en"), "missing wordmark: {rendered}");
        assert!(rendered.contains("hello from test"), "missing user row");
        assert!(rendered.contains("deepseek-chat"), "missing model");
    }
}
