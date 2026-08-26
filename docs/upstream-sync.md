# Syncing this English fork with upstream

This repository is an English TypeScript fork of
[ccch1mneyyy/dsh-TUI](https://github.com/ccch1mneyyy/dsh-TUI). The user-facing
command is `dsh-tui-en`. The DSH profile id and npm package stay `dsh-tui` /
`@deepseek-harness-tui/dsh-tui`.

Do **not** strip every Chinese string after each upstream update. Upstream is
Chinese-first. Deleting `zh` copy, translating comments, or flattening the
i18n dictionary makes the next merge much harder.

## What to keep from upstream

Leave these alone unless a merge conflict forces a choice:

- `zh:` entries in `src/i18n.ts` (keep the bilingual map)
- Chinese comments in `src/` and `scripts/`
- Chinese text inside test **fixtures** (`你好`, `问题 8`, …)
- Profile / package / path names: `dsh-tui`, `~/.dsh-tui`,
  `@deepseek-harness-tui/dsh-tui`, `dsh-tui-vscode`

## What to re-apply after every merge

| Surface | Rule |
| --- | --- |
| CLI | `package.json` `bin` has **only** `dsh-tui-en` → `./bin/dsh-tui.js` |
| UI language | `LANGS = ['en']`; `t()` / `tOr()` resolve English; `setLang` and startup stay English. `/lang zh` is a stored alias and must not switch the UI |
| README | English README (`README_EN.md` from upstream) retitled `dsh-tui-en`, no Chinese/English switcher |
| Docs | Copy each `docs/*.en.md` over the matching `docs/*.md`. Keep the `.en.md` files for the next merge |
| Launcher help | `Usage: dsh-tui-en …`; user-facing messages English |
| Tests | Fix assertions that wait on Chinese **chrome** (`会话树`, `用法`, `摘要已折叠`, …). Leave Chinese fixture strings |

`t()` already ignores `zh` when both languages exist. That is the whole point
of keeping the bilingual dictionary.

## Merge procedure

Remotes:

```
origin    https://github.com/raktim-mondol/dsh-tui-en.git
upstream  https://github.com/ccch1mneyyy/dsh-TUI.git
```

1. `git fetch upstream`
2. Tag a backup branch: `git branch backup-before-upstream-$(date +%Y%m%d)`
3. Merge with upstream winning content conflicts, then re-apply the overlay:

   ```sh
   git merge -X theirs upstream/main
   ```

   `-X theirs` prefers upstream on overlapping hunks so new features land.
   Fork-only files that upstream did not touch stay as they are.
4. Submodules:
   - Init new ones (`dsh-auth`, …).
   - If `dsh-ecosystem-spec` pins a commit GitHub does not have (upstream has
     used unpublished SHAs), check out `origin/main` of
     `https://github.com/T-Auto/dsh-ecosystem-spec` and record that pin.
5. Finish the merge commit.
6. Re-apply the overlay in a **second** commit (do not mix it into the merge):
   - Restore `package.json` `bin` to `dsh-tui-en` only.
   - Restore English i18n resolution in `src/i18n.ts` (`LANGS`, `t`, `tOr`,
     `setLang`, `detectLocaleLang`, `resolveStartupLang`).
   - Promote `README_EN.md` → `README.md` and `docs/*.en.md` → `docs/*.md`.
   - Rename user-facing **command** mentions to `dsh-tui-en` with the
     constraints below.
   - Fix verify scripts that assert Chinese chrome.
7. Compile and run at least:

   ```sh
   npx tsc -p tsconfig.json
   node --import tsx/esm scripts/verify-i18n.ts
   node scripts/verify-cli-subcommands.mjs
   node scripts/verify-launcher.mjs
   node --import tsx/esm scripts/verify-i18n-command-descriptions.tsx
   ```

   Then run any verify script that failed because it waited on Chinese UI
   labels.

## Renaming the command without breaking ids

Never run a global `dsh-tui` → `dsh-tui-en` replace. `dsh-tui` is a prefix of
`dsh-tui-en`, so a second pass produces `dsh-tui-en-en.cmd` and can rewrite
Cordis row ids.

Protect these tokens, then replace only remaining command invocations:

- `@deepseek-harness-tui/dsh-tui`
- `dsh-tui-en` (already renamed)
- `dsh-tui-vscode`, `dsh-tui-ecosystem`
- `~/.dsh-tui`, `profiles/dsh-tui`
- `--profile dsh-tui`, `--kind dsh-tui`, `--agent dsh-tui`
- `dsh-tui profile`, `dsh-tui namespace`
- Cordis ids: `- id: dsh-tui` (not `- id: dsh-tui-en`)

After the rename, grep for `dsh-tui-en-en` and for `- id: dsh-tui-en`. Both
are bugs.

## Do not do these

- Flatten `src/i18n.ts` to English-only strings. Upstream will conflict on
  every key.
- Delete `zh` keys to “clean Chinese”.
- Translate comments in `src/` / `scripts/` as a batch.
- Rewrite every verify script up front. Fix the ones that fail.
- Change the DSH profile name or the npm package name.

## Checklist

- [ ] `package.json` `bin` is `{ "dsh-tui-en": "./bin/dsh-tui.js" }`
- [ ] `src/i18n.ts` `LANGS` is `['en']` and `t()` uses English
- [ ] README title is `dsh-tui-en`; quick start runs `dsh-tui-en`
- [ ] Unsuffixed `docs/*.md` are English; `docs/*.en.md` still exist
- [ ] No `dsh-tui-en-en` typos
- [ ] Cordis examples still use `- id: dsh-tui`
- [ ] `dsh-tui-en.cmd` exists for Windows checkouts
- [ ] i18n / launcher / CLI verify scripts pass
