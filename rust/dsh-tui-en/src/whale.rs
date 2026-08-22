//! Pixel whale from the TypeScript splash (standard frame, half-block cells).

use ratatui::style::{Color, Style};
use ratatui::text::{Line, Span};

use crate::theme::{WHALE_BELLY, WHALE_BODY, WHALE_MOUTH, WHALE_OUTLINE};

/// 25×40 sprite: D outline, B body, L belly, W mouth, `.` transparent.
const STANDARD: [&str; 25] = [
    "........................................",
    "........................................",
    "........................D...............",
    ".......................DBD.......D......",
    ".......................DBBD.....DBD.....",
    ".......................DBBBD..DDBBD.....",
    ".......................DBBBBDDBBBBD.....",
    ".......DDDDDDDDD........DBBBBBBBBD......",
    "......DBBBBBBBBBDD.......DBBBBBBBD......",
    ".....DBBBBBBBBBBBBDD.....DBBBBBDD.......",
    "....DBBBBBBBBBBBBBBBDD....DBBBD.........",
    "...DDBBBBBBBBBBBBBBBBBD..DBBBBD.........",
    "...DBBBBBBBBBBBBBBBBBBBDDBBBBBD.........",
    "...DBBBDBBBBBBDBBBBBBBBBBBBBBBD.........",
    "...DBBBDBBBBBBDBBBBBBBBBBBBBBD..........",
    "...DBBBBBBBBBBBBBBBBBBBBBBBBBD..........",
    "...DBBBBWWWWWWWBBBBBBBBDBBBBD...........",
    "...DDBWWWWWWWWWWWWBBBBBBDBBBD...........",
    "....DLLWWWWWWWWWWWWDBBBBDDBD............",
    ".....DLLLWWWWWWWWWWDBBBBBDD.............",
    "......DDLLLWWWWWWLLLDBBBBBDD............",
    "........DLLLLLLLLLLLDDBBBBBBD...........",
    ".........DDDDDDDDDDD..DDDDDDD...........",
    "........................................",
    "........................................",
];

fn pixel(ch: u8) -> Option<Color> {
    match ch {
        b'D' => Some(WHALE_OUTLINE),
        b'B' => Some(WHALE_BODY),
        b'L' => Some(WHALE_BELLY),
        b'W' => Some(WHALE_MOUTH),
        _ => None,
    }
}

/// 13 terminal rows; each cell is two sprite pixels packed into `▀`.
pub fn whale_lines() -> Vec<Line<'static>> {
    let mut lines = Vec::with_capacity(13);
    let mut r = 0;
    while r < STANDARD.len() {
        let upper = STANDARD[r].as_bytes();
        let lower = STANDARD.get(r + 1).map(|s| s.as_bytes()).unwrap_or(&[]);
        let width = upper.len().max(lower.len());
        let mut spans: Vec<Span<'static>> = Vec::new();
        for x in 0..width {
            let up = upper.get(x).copied().and_then(pixel);
            let lo = lower.get(x).copied().and_then(pixel);
            let span = match (up, lo) {
                (Some(fg), Some(bg)) => Span::styled("▀", Style::default().fg(fg).bg(bg)),
                (Some(fg), None) => Span::styled("▀", Style::default().fg(fg)),
                (None, Some(bg)) => Span::styled("▄", Style::default().fg(bg)),
                (None, None) => Span::raw(" "),
            };
            spans.push(span);
        }
        while matches!(spans.last(), Some(s) if s.content == " ") {
            spans.pop();
        }
        lines.push(Line::from(spans));
        r += 2;
    }
    lines
}

pub fn whale_width() -> u16 {
    40
}

pub fn whale_height() -> u16 {
    13
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_frame_is_thirteen_half_block_rows() {
        let lines = whale_lines();
        assert_eq!(lines.len(), 13);
        assert_eq!(whale_height(), 13);
        assert_eq!(whale_width(), 40);
    }
}
