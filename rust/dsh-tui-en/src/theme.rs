//! Gentle Mist Blue palette, matching the TypeScript `dark` theme.

use ratatui::style::{Color, Modifier, Style};

pub const BRAND: Color = Color::Rgb(0x7d, 0xa1, 0xde);
pub const BRAND_ICE: Color = Color::Rgb(0xab, 0xc2, 0xec);
pub const TEXT: Color = Color::Rgb(0xe8, 0xe6, 0xe0);
pub const INACTIVE: Color = Color::Rgb(0x8d, 0x95, 0xa6);
pub const SUBTLE: Color = Color::Rgb(0x5e, 0x66, 0x73);
pub const SUCCESS: Color = Color::Rgb(0x82, 0xb8, 0x9d);
pub const ERROR: Color = Color::Rgb(0xda, 0x8a, 0x93);
pub const WARNING: Color = Color::Rgb(0xd8, 0xb2, 0x70);
pub const USER_BG: Color = Color::Rgb(0x24, 0x2b, 0x3a);
pub const TOOL_EXEC: Color = Color::Rgb(0x56, 0xb6, 0xc2);
pub const PROMPT_BORDER: Color = Color::Rgb(0x55, 0x60, 0x6f);
pub const WHALE_OUTLINE: Color = Color::Rgb(20, 38, 96);
pub const WHALE_BODY: Color = Color::Rgb(78, 111, 255);
pub const WHALE_BELLY: Color = Color::Rgb(190, 225, 255);
pub const WHALE_MOUTH: Color = Color::Rgb(255, 255, 255);

pub fn brand() -> Style {
    Style::default().fg(BRAND)
}

pub fn text() -> Style {
    Style::default().fg(TEXT)
}

pub fn dim() -> Style {
    Style::default().fg(INACTIVE)
}

pub fn subtle() -> Style {
    Style::default().fg(SUBTLE)
}

pub fn error() -> Style {
    Style::default().fg(ERROR)
}

pub fn success() -> Style {
    Style::default().fg(SUCCESS)
}

pub fn warning() -> Style {
    Style::default().fg(WARNING)
}

pub fn user() -> Style {
    Style::default().fg(TEXT).bg(USER_BG)
}

pub fn assistant() -> Style {
    Style::default().fg(BRAND)
}

pub fn reasoning() -> Style {
    Style::default().fg(INACTIVE).add_modifier(Modifier::ITALIC)
}

pub fn tool() -> Style {
    Style::default().fg(TOOL_EXEC)
}

pub fn bold_brand() -> Style {
    Style::default().fg(BRAND).add_modifier(Modifier::BOLD)
}
