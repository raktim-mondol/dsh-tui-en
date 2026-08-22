use std::io::{self, stdout};
use std::time::Duration;

use anyhow::Result;
use crossterm::event::{
    DisableMouseCapture, EnableMouseCapture, Event, EventStream, KeyCode, KeyEvent, KeyModifiers,
};
use crossterm::execute;
use crossterm::terminal::{
    disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen,
};
use futures::StreamExt;
use ratatui::backend::CrosstermBackend;
use ratatui::Terminal;

use crate::backend::Engine;
use crate::protocol::ChannelSnapshot;
use crate::ui::{self, complete_slash};

pub struct App {
    engine: Engine,
    input: String,
    cursor: usize,
    scroll: u16,
    spinner: usize,
    help: bool,
    history: Vec<String>,
    history_index: Option<usize>,
    running: bool,
}

impl App {
    pub fn new(engine: Engine) -> Self {
        Self {
            engine,
            input: String::new(),
            cursor: 0,
            scroll: 0,
            spinner: 0,
            help: false,
            history: Vec::new(),
            history_index: None,
            running: true,
        }
    }

    pub async fn run(mut self) -> Result<()> {
        enable_raw_mode()?;
        let mut stdout = stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
        let mut terminal = Terminal::new(CrosstermBackend::new(stdout))?;
        let mut events = EventStream::new();
        let mut ticks = tokio::time::interval(Duration::from_millis(80));

        let result = loop {
            let snapshot = self.engine.snapshots.borrow().clone();
            terminal.draw(|frame| {
                ui::draw(
                    frame,
                    ui::ViewModel {
                        snapshot: &snapshot,
                        input: &self.input,
                        cursor: self.cursor,
                        scroll: self.scroll,
                        spinner: self.spinner,
                        help: self.help,
                        version: env!("CARGO_PKG_VERSION"),
                    },
                );
            })?;

            if !self.running {
                break Ok(());
            }

            tokio::select! {
                _ = ticks.tick() => {
                    if snapshot.state.working {
                        self.spinner = self.spinner.wrapping_add(1);
                    }
                    let _ = self.engine.snapshots.has_changed();
                }
                event = events.next() => {
                    match event {
                        Some(Ok(Event::Key(key))) => self.on_key(key, &snapshot),
                        Some(Ok(Event::Resize(_, _))) => {}
                        Some(Err(err)) => break Err(err.into()),
                        None => break Ok(()),
                        _ => {}
                    }
                }
            }
        };

        disable_raw_mode()?;
        execute!(io::stdout(), LeaveAlternateScreen, DisableMouseCapture)?;
        self.engine.shutdown();
        result
    }

    fn on_key(&mut self, key: KeyEvent, snapshot: &ChannelSnapshot) {
        if key.modifiers.contains(KeyModifiers::CONTROL) {
            match key.code {
                KeyCode::Char('c') => {
                    if snapshot.state.working {
                        self.engine.cancel();
                    } else if self.input.is_empty() {
                        self.running = false;
                    } else {
                        self.input.clear();
                        self.cursor = 0;
                    }
                }
                KeyCode::Char('d') => self.running = false,
                KeyCode::Char('l') => self.engine.new_session(),
                KeyCode::Char('u') => {
                    self.input.clear();
                    self.cursor = 0;
                }
                _ => {}
            }
            return;
        }

        match key.code {
            KeyCode::Esc => {
                if self.help {
                    self.help = false;
                } else if !self.input.is_empty() {
                    self.input.clear();
                    self.cursor = 0;
                }
            }
            KeyCode::Enter => self.submit(),
            KeyCode::Backspace => {
                if self.cursor > 0 {
                    let idx = prev_char_boundary(&self.input, self.cursor);
                    self.input.replace_range(idx..self.cursor, "");
                    self.cursor = idx;
                }
            }
            KeyCode::Delete => {
                if self.cursor < self.input.len() {
                    let idx = next_char_boundary(&self.input, self.cursor);
                    self.input.replace_range(self.cursor..idx, "");
                }
            }
            KeyCode::Left => {
                self.cursor = prev_char_boundary(&self.input, self.cursor);
            }
            KeyCode::Right => {
                self.cursor = next_char_boundary(&self.input, self.cursor);
            }
            KeyCode::Home => self.cursor = 0,
            KeyCode::End => self.cursor = self.input.len(),
            KeyCode::Up => self.history_prev(),
            KeyCode::Down => self.history_next(),
            KeyCode::PageUp => self.scroll = self.scroll.saturating_add(8),
            KeyCode::PageDown => self.scroll = self.scroll.saturating_sub(8),
            KeyCode::Tab => {
                if let Some(filled) = complete_slash(&self.input) {
                    self.input = filled;
                    self.cursor = self.input.len();
                }
            }
            KeyCode::Char(ch) => {
                self.input.insert(self.cursor, ch);
                self.cursor += ch.len_utf8();
            }
            _ => {}
        }
    }

    fn submit(&mut self) {
        let text = self.input.trim().to_string();
        if text.is_empty() {
            return;
        }
        self.history.push(text.clone());
        self.history_index = None;
        self.input.clear();
        self.cursor = 0;
        self.scroll = 0;

        if let Some(command) = text.strip_prefix('/') {
            match command.split_whitespace().next().unwrap_or("") {
                "quit" | "exit" | "q" => {
                    self.running = false;
                    return;
                }
                "help" => {
                    self.help = true;
                    return;
                }
                "new" | "clear" => {
                    self.engine.new_session();
                    return;
                }
                "status" => {
                    self.help = true;
                    return;
                }
                _ => {}
            }
        }
        self.engine.submit(text);
    }

    fn history_prev(&mut self) {
        if self.history.is_empty() {
            return;
        }
        let idx = match self.history_index {
            None => self.history.len() - 1,
            Some(0) => 0,
            Some(i) => i - 1,
        };
        self.history_index = Some(idx);
        self.input = self.history[idx].clone();
        self.cursor = self.input.len();
    }

    fn history_next(&mut self) {
        let Some(idx) = self.history_index else { return };
        if idx + 1 >= self.history.len() {
            self.history_index = None;
            self.input.clear();
        } else {
            self.history_index = Some(idx + 1);
            self.input = self.history[idx + 1].clone();
        }
        self.cursor = self.input.len();
    }
}

fn prev_char_boundary(s: &str, mut idx: usize) -> usize {
    if idx == 0 {
        return 0;
    }
    idx -= 1;
    while idx > 0 && !s.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn next_char_boundary(s: &str, mut idx: usize) -> usize {
    if idx >= s.len() {
        return s.len();
    }
    idx += 1;
    while idx < s.len() && !s.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}
