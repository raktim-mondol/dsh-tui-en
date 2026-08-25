# Themes

[Documentation index](README.md)

## Built-in themes

dsh-TUI provides three Gentle Mist Blue palettes, plus an `auto` pseudo-theme:

| Name | Purpose |
| --- | --- |
| `auto` | Pseudo-theme: follows the system/terminal background, resolving to `light` or `dark` |
| `light` | Warm-white surfaces, ink body text, and mist-blue interaction color |
| `dark` | Dark-terminal adaptation with warm-gray text and soft blue accents |
| `dark-ansi` | Compatibility fallback using only the 16 ANSI colors |

Without an explicit choice, the TUI queries the terminal background with OSC
11 and selects `light` or `dark`. It falls back to `dark` when the terminal does
not answer.

`auto` 把这次性启动检测变成常驻选择：它在 `/theme`、`DSH_TUI_THEME`、
`~/.dsh-tui/theme.json` 中都是合法值。选中 `auto` 时立即应用上次检测结果，并
在后台重新查询 OSC 11——跟随系统主题的终端切换深浅色后，再次选择 `auto`（或
重启）即可跟上。`/theme status` 会显示 `auto` 当前解析到的色板。解析结果通过
`getTheme('auto')` 对所有消费方生效。注意：用户自定义主题若命名为 `auto` 会被
内置伪主题遮蔽（选择器中不列出）。

Selection precedence is:

```text
DSH_TUI_THEME
  > persisted choice in ~/.dsh-tui/theme.json
  > OSC 11 background detection
  > dark fallback
```

## Switching themes

- `/theme` opens the picker, with `auto` and the built-ins before custom themes.
- `/theme <name>` switches directly.
- `/theme status` shows the current theme and persistence location.

Confirming a choice hot-switches immediately and writes it to
`~/.dsh-tui/theme.json`. `DSH_TUI_THEME`, when set, still wins on the next launch.

## Custom themes

Place JSON files under `~/.dsh-tui/themes/`. Each file starts from one built-in
palette and overrides a subset of its colors:

```json
{
  "name": "sakura",
  "displayName": "Sakura",
  "base": "dark",
  "colors": {
    "claude": "#FF9EC7",
    "claudeShimmer": "#FFC0D5",
    "permission": "#FFB3CC",
    "promptBorder": "#B08B99",
    "text": "#E8E6E0",
    "inactive": "#A99BA0",
    "subtle": "#8A7A80",
    "selectionBg": "#5C3A44",
    "success": "#9CC7A8",
    "error": "#E08591",
    "warning": "#E0C08A"
  }
}
```

Fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `base` | Yes | `light`, `dark`, or `dark-ansi`; source for every non-overridden color |
| `colors` | Yes | Partial override of semantic Theme keys |
| `name` | No | Theme ID; defaults to the filename |
| `displayName` | No | Picker label; defaults to `name` |

When the file declares `name`, its filename remains a loading alias. See the
`Theme` type in [`src/theme.ts`](../src/theme.ts) for every semantic key.

Common override groups:

| Group | Keys |
| --- | --- |
| Tool card surfaces (two depths) | `toolCardBackground`, `toolCardBackgroundDim` |
| Tool status dots (by category) | `toolDotExec`, `toolDotRead`, `toolDotWrite`, `toolDotWeb`, `toolDotTask` |
| Diff rows | `diffAdded`, `diffRemoved`, `diffAddedDimmed`, `diffRemovedDimmed`, `diffAddedWord`, `diffRemovedWord` |
| Diff syntax highlighting | `syntaxKeyword`, `syntaxString`, `syntaxComment`, `syntaxNumber`, `syntaxFunction`, `syntaxType`, `syntaxVariable`, `syntaxOperator`, `syntaxPunctuation`, `syntaxConstant` |

Diff semantics outrank syntax colors: changed words always render in
`diffAddedWord` / `diffRemovedWord`; syntax colors apply to unchanged text only.

## Color formats

Accepted forms:

- `#rgb`
- `#rrggbb`
- `#rrggbbaa`
- `rgb(r,g,b)`
- `ansi256(n)`
- 16-color names such as `ansi:black` and `ansi:redBright`

Colors must be concrete values. CSS variables, gradients, and arbitrary CSS
color names are not accepted.

## Validation and failure behavior

- Unknown Theme key: skip that key with a warning and keep the rest.
- Invalid color: skip that value with a warning.
- Invalid `base`, malformed JSON, or non-object `colors`: skip the whole file.
- Missing theme referenced by the environment or preference file: warn and
  continue with background detection.
- One bad theme never blocks TUI startup or other themes.

Theme names are user input. The loader verifies that the resolved path remains
inside `~/.dsh-tui/themes/`, preventing names from escaping the theme directory.
Preserve that containment check when changing the implementation.

## Design guidance

- Use semantic keys instead of changing only `text` and `background`. Check at
  least body, inactive, focus, selection, success, warning, error, and diff
  colors.
- Test light themes in a real light terminal and dark themes in a dark one.
- Check 16-color, 256-color, and truecolor fallback behavior.
- Verify narrow layouts, tool diffs, questionnaires, multiline input, and
  selection contrast.
- Theme files should contain display metadata and color only, never credentials
  or other user data.

When developing the theme subsystem, run:

```sh
node --import tsx/esm scripts/verify-themes.mjs
```

See [Architecture and limitations](architecture.md) for terminal capability
and renderer details.
