> [!WARNING]
> **基线过时提示（v0.9.0+ 读者）**：本目录文档基于 2026-08-15 审计基线 `b2f4087`
> （目录重命名之前）。其中 `~/.dsh-cc/*` 现为 `~/.dsh-tui/*`（theme/model/preset/lang
> 等 prefs 均随 `DATA_DIR` 迁移），顶层 `src/plugin.ts` / `src/channel.ts` 等现为
> `src/dsh-adapter/` 下。引用时以活文档与源码为准。

# dsh-cc-tui 架构文档

This directory is the architecture documentation set for dsh-cc-tui
(`@deepseek-ai/dsh-cc-tui`), complementing the user guides under `docs/`
(getting-started / configuration / interaction / themes / architecture /
contributing): the user guides are aimed at usage and configuration, while
this directory is aimed at source structure, runtime wiring, and a
provenance audit.

## Audit info

| Item | Value |
| --- | --- |
| Audit baseline | main / `b2f408740a544f92a1e6e5ca8e07017793cabd63` (git describe: v0.4.1-48-gb2f4087) |
| Audit date | 2026-08-15 |
| Audit mode | Strict read-only: not built, not run, no dependencies installed; `lib/` is a build artifact and its contents were not read |
| Coverage | 282 non-build-artifact entries (src 209, scripts 48, skills 7, .github 2, root 16); `lib/`'s 625 files excluded as build output |

## Document index

| Document | Purpose |
| --- | --- |
| [overview.md](overview.md) | Overview: project positioning, runtime wiring, layering and module boundaries |
| [lifecycle.md](lifecycle.md) | Plugin lifecycle and assembly: cordis config, startup order, command registration, the exit funnel |
| [ink-core.md](ink-core.md) | The ported Ink/Yoga render kernel: the render pipeline, layout engine, terminal protocol, component and hooks map |
| [rendering.md](rendering.md) | Render pipeline and performance: two-tier throttling, virtualization, ghosting fixes, CJK truncation and text measurement |
| [input-commands.md](input-commands.md) | Input handling, IME avoidance, and the command system (/rewind, /new, /compact, etc.) |
| [model-route.md](model-route.md) | Model routing and the status bar: atomic resolution, resume tracking, the /model command |
| [session-context.md](session-context.md) | Session persistence and context: the resume contract, the JSONL/SQLite doc conflict, teardown |
| [mcp-stderr.md](mcp-stderr.md) | MCP integration and subprocess stderr aggregation (issue #17) |
| [update.md](update.md) | The update system: version checking, the /update pipeline, and confirmed defects |
| [theme-i18n.md](theme-i18n.md) | The theme system and UI internationalization |
| [origin.md](origin.md) | Provenance audit: classification of the 282 entries, evidence tiers, and the marking methodology |
| [unknowns.md](unknowns.md) | List of unverified items and documentation conflicts |
| [architecture.mermaid](architecture.mermaid) | Master Mermaid architecture diagram: config layer → entry point → channel → app layer → render kernel → text measurement → input chain → theme/i18n → system features → provenance audit; all information is embedded in the nodes |
| [ACCEPTANCE.md](ACCEPTANCE.md) | Acceptance report and delivery checklist: files changed, counting methodology, verification record, git status, delivery verdict |

## Key findings at a glance

- Provenance breakdown (282 entries): unable to confirm 116, project-authored
  81, leaked port 57, open-source port 23 (port-ink 18 + port-pi 3 +
  port-yoga 2), generated 5; no file could be attributed to official DeepSeek
  authorship (see [origin.md](origin.md) for details).
- There's a documentation conflict around session persistence: the current
  config in `cordis.patch.yml:147` and `cordis.yml:162` both mount
  `@deepseek-ai/dsh-session-persistence-jsonl` (JSONL); the older docs
  (docs/configuration.md:154-155, docs/architecture.md:77,
  docs/getting-started.md:71) claim the profile mode uses SQLite. The current
  config is treated as authoritative, and the SQLite claim is marked
  "documentation conflict / unconfirmed" (see
  [session-context.md](session-context.md#session-persistence-backend-and-the-jsonlsqlite-documentation-conflict)
  for details).
- The update system has a confirmed code defect: `src/update.ts:232` only
  reads the version after the update completes and writes it to
  `DSH_CC_UPDATED_FROM`, so even a successful update triggers a "version
  unchanged" warning (see [update.md](update.md#confirmed-defects) for
  details).
- The /rewind command taking effect together with /new in one go (pr-55,
  merge commit dc678d8) landed after the v0.4.1 tag (eeca418) and is already
  included in the current baseline (see
  [input-commands.md](input-commands.md#rewindissue-43pr-55) for details).

## Linking and citation conventions

- Cross-document links use relative paths; references to source and config
  use a `relative-path:line-number` text form (e.g. `src/plugin.ts:35`), with
  line numbers always relative to the audit baseline b2f4087.
- Evidence is classified into three tiers: explicit evidence (source
  comments, commit records, or an exact upstream correspondence), strong
  indication (multiple pieces of indirect evidence), and unverified (unable
  to confirm). See [origin.md](origin.md) for the evidence tier behind each
  provenance conclusion.
- Unverified items are always marked unknown/unverified rather than guessed
  at; see the list in [unknowns.md](unknowns.md).
