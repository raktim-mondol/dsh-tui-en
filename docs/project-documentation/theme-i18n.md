# Theme system and i18n

This document covers the Gentle Mist Blue theme family (three built-in
palettes + user-defined themes), startup resolution and hot /theme
switching, plus the en/zh bilingual i18n system and hot /lang switching.
All line numbers are relative to the audit baseline b2f4087.

## Theme family and key surface

Three built-in palettes (`src/theme.ts`): `THEME_NAMES = ['dark',
'dark-ansi', 'light']` (:92). dark is a dark-mode fit, light is a strict
light-mode card, dark-ansi is a truecolor fallback using only the 16
standard ANSI colors (:261-269, commented "verbatim from the leak"). The
Theme type has **69 string keys in total** (counted programmatically),
grouped and commented by semantics: Semantic / Diff / Agent / Grove /
Chrome / TUI V2 (:13-89).

- An unknown theme name falls back to `dark` (src/theme.ts:346-355).
- The 8 `*_FOR_SUBAGENTS_ONLY` keys and keys like
  rainbow_*/briefLabel*/clawd_*/chromeYellow/rate_limit_* have **no consumer
  at all** within src/ (a grep only hits their definitions and
  FOR_SYSTEM_SPINNER's usage); suspected to be kept for compatibility with
  the Claude Code leak's key surface — whether any external consumer exists
  can't be confirmed from this repo.
- A module-level mirror of the active theme (src/theme.ts:381-398) serves
  non-React rendering: markdown inline code reads the current theme's
  permission color from it (src/cc/markdown.ts:24-26).
- ui.ts exports a themed Box/Text facade (src/ui.ts:2-13): the ported CC
  components use theme keys like `color="subtle"` as-is.

## Startup resolution chain (forced → probed)

```text
src/plugin.ts:298-302  React.createElement(ThemeProvider, null, ...) — the
  theme prop is passed null, and that prop path is unused in production
  (Config has no theme key, see the conflict table below)
  -> src/components/design-system/ThemeProvider.tsx:80-91 forced = theme ?? envThemeOverride() ??
     readThemePref(): CC_TUI_THEME (:54-57) > the persisted choice in
     ~/.dsh-cc/theme.json (src/themePrefs.ts:38-44, only takes effect when
     CC_TUI_THEME is unset) > probing
  -> isThemeAvailable validation (:83-90): an invalid forced name logs a
     console.warn and falls through to probing
  -> OSC 11 probe (src/components/design-system/ThemeProvider.tsx:113-125): in raw mode,
     querier.send(oscColor(11)), a 400ms timeout/no reply/non-rgb -> dark,
     sRGB luma=0.299r+0.587g+0.114b > 140 -> light
  -> child components render only once the theme settles — the first frame
     is already the final palette, with no dark→light flash
     (:10-27 "Children render only after the theme settles")
  -> getTheme resolution (src/theme.ts:346-355): a built-in name returns
     directly; anything else goes through the resolveCustomTheme registered
     via registerCustomThemeResolver
     (src/components/design-system/ThemeProvider.tsx:29-32 -> src/customTheme.ts:254-289)
  -> once settled, setActiveThemeName mirrors it to the module level
     (src/components/design-system/ThemeProvider.tsx:151-153)
```

Related history for theme probing: commit 6dc0f4b (2026-08-06, the Gentle
Mist Blue dual theme + OSC 11 probing), commit 843fb76 (2026-08-13, fixed a
race between XTVERSION and OSC 11 in the same tick over raw-mode
borrow/release that garbled the echoed reply).

## The /theme and /lang commands

| Command | Form | Behavior | Location |
| --- | --- | --- | --- |
| /theme | `/theme status` | Shows the current selection | src/screens/Chat.tsx:408-438 |
| /theme | `/theme <name>` | setTheme switches directly | same |
| /theme | bare /theme | Opens the ThemePicker selector (no dedicated shortcut; Enter confirms/Esc cancels) | same |
| /lang | `/lang status` | Shows the current language (bare /lang does the same) | src/screens/Chat.tsx:372-407 |
| /lang | `/lang en\|zh` | writeLangPref persists first → setLang hot-switches | same |
| /lang | `/lang help` | Help | same |

The /theme switch chain
(src/components/design-system/ThemeProvider.tsx:133-144): isThemeAvailable
validation → writeThemePref persists to ~/.dsh-cc/theme.json first
(src/themePrefs.ts:52-60) → setActive hot-switches — "persists first (a
choice that cannot be saved never silently disappears)".

## User-defined themes (0.2.0, commit 33a4a07)

File: `~/.dsh-cc/themes/<name>.json`, shaped { name?, displayName?, base,
colors }:

- base is required (light/dark/dark-ansi); buildTheme layers the colors
  override on top of the base palette (src/customTheme.ts:249-256).
- Accepted color forms: #rgb/#rrggbb/#rrggbbaa, rgb(r,g,b), ansi256(n), and
  the 16 ansi: names (src/customTheme.ts:49-73, matching the shape of
  src/ink/styles.ts:22-41's Color type — the 16 ansi names + a Color union).
- Validation is best-effort, key by key (src/customTheme.ts:137-206): bad
  JSON/non-object/bad base/an unsafe name skips the whole file; unknown
  keys and invalid color values are skipped individually with a warning;
  **an absent colors is valid** (returns an empty override, :175-178); each
  kind of failure warns exactly once.
- isSafeThemeName guards against directory traversal (:90-103) — the name
  input comes from CC_TUI_THEME and /theme, and is forbidden from escaping
  the themes directory.
- resolveCustomTheme is cached with a name→file index (:258-289): a theme
  whose declared name differs from its file name builds the index after its
  first miss, so the display name resolves everywhere afterward; failures
  aren't cached.
- listCustomThemes sorts by theme name via localeCompare, skipping bad files
  (:233-247).
- ThemePicker's row preview (src/components/ThemePicker.tsx:12-65): a ██
  double-block color swatch, previewing the claude/text/success keys;
  options are the three built-ins plus any discovered custom themes.
- Regression: scripts/verify-themes.mjs (a temp HOME + 7 fixtures, 19
  assertions, exits non-zero on failure; not mounted in CI, a manual
  regression script), run directly via `node --import tsx/esm
  scripts/verify-themes.mjs`.

## The i18n system (#22, commit 283aba1)

- A flat dict: **215 keys in total** (counted programmatically), each key a
  {zh, en} string pair, zh by default (src/i18n.ts:30-279); t(key, params)
  substitutes {{name}} placeholders, rendering the key itself when it's
  missing — "a typo is visible in the UI instead of silently blank"
  (src/i18n.ts:13-17,322-328).
- A 5-tier language-resolution chain (src/i18n.ts:5-11,372-382):
  `CC_TUI_LANG` env → the `lang` cordis.yml key → the persisted /lang
  choice in ~/.dsh-cc/lang.json → OS locale (LC_ALL/LC_MESSAGES/LANG) → zh.
- Settled at startup (src/plugin.ts:40-45): setLang runs before the first
  render (env > config.lang > resolveStartupLang()) — "Must settle before
  the first render so every module resolves strings in the same language".
- Hot-switching at runtime (src/i18n.ts:305-308): setLang walks listeners;
  Chat re-renders the whole UI via useSyncExternalStore(subscribeLang,
  getLang) (src/screens/Chat.tsx:119-120); non-React modules like
  src/channel.ts call t() at the call site.
- Persisted to ~/.dsh-cc/lang.json (src/i18n.ts:336-365); parseLangPref only
  accepts zh/en.

## Conflicts

| Item | Both sides |
| --- | --- |
| Docs claim colors is required | docs/themes.md:67's field table marks `colors` "yes" (required); src/customTheme.ts:175-178 returns a valid spec (an empty override) when colorsRaw === undefined, and only rejects the whole file when colors is present but not an object |
| StatusMetrics hardcodes color values | src/screens/StatusMetrics.ts:223-228 hardcodes success '78;186;101'/warning '202;138;4'/error '255;107;128' with the comment "cc-tui dark theme values (theme.ts)"; the dark theme (src/theme.ts:132-134) is actually rgb(130,184,157)/rgb(216,178,112)/rgb(218,138,147) — none of the three match, and with no useTheme involved, switching themes has no effect on them |
| ThemePicker sort comment | src/components/ThemePicker.tsx:46-49's comment claims custom themes are "sorted by file name"; the code actually sorts by theme name via localeCompare (src/customTheme.ts:246) — the order differs when the declared name differs from the file name |
| Language-chain comments are inconsistent | src/plugin.ts:40-43's comment chain omits the OS-locale step; src/index.ts:54-55's comment omits both config.lang and OS locale; the code actually walks the full 5-tier chain consistently (src/plugin.ts:45 resolveStartupLang = readLangPref ?? detectLocaleLang) |
| Theme description path built from the display name | src/i18n.ts:243's 'theme-user-base' builds ~/.dsh-cc/themes/{{name}}.json from {{name}}; src/components/ThemePicker.tsx:56-62 passes spec.name — when the declared name differs from the file name (e.g. good.json declaring name sakura), the displayed path doesn't exist on disk (a cosmetic issue only) |

## Unverified items

- Whether keys with no consumer, like *_FOR_SUBAGENTS_ONLY, have any
  external consumer (the DSH engine/other plugins) — can't be confirmed
  from this repo.
- The theme prop path on
  src/components/design-system/ThemeProvider.tsx is unused in production
  (src/plugin.ts:298-302 passes null); suspected to be kept for leak-API
  compatibility, with no caller at all.
- The exact upstream source file behind dark-ansi's "verbatim from the
  leak" can't be identified (node_modules isn't installed, and lib is a
  build artifact outside the audit).
- Whether a /lang switch affects the UI copy of other mounted DSH plugins
  (the i18n dictionary only covers cc-tui itself, and there's no evidence
  on whether the engine layer consumes the same language mechanism).
- 7b425de (message-list virtualization) was matched by `git log --grep
  'theme'` only because its commit body contains the regression-count
  phrase "theme 22/22", unrelated to the theme feature; the theme-commit
  list should be taken from the ones with an explicit title —
  6dc0f4b/843fb76/33a4a07/283aba1.

Related documents: [ink-core.md](ink-core.md) (terminal-capability probing/
the querier), [lifecycle.md](lifecycle.md) (startup order),
[input-commands.md](input-commands.md) (the /theme, /lang command entry
points), [unknowns.md](unknowns.md).
