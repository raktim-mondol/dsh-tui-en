#!/bin/sh
# One-shot npm install for dsh-TUI. Uses official dsh CLI profile plugins:
# `add` initializes the profile (first layer dsh-base); after pnpm install,
# dsh.bundle.patch metadata appends this package as a bundle layer. This
# package's patch also inserts the working-activity line (dsh-working-activity,
# pulled in as an npm dependency). One command, fully ready. No DSH source
# snapshot, no workspace link.
set -eu

if ! command -v dsh >/dev/null 2>&1; then
  echo "dsh CLI not found. Install the official client first:" >&2
  echo "  npm install -g @deepseek-ai/dsh" >&2
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. dsh plugin forwards installs to pnpm. Install it first:" >&2
  echo "  npm install -g pnpm   (or enable corepack: corepack enable pnpm)" >&2
  exit 1
fi

dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui
echo
echo "Install complete. Start with: dsh-tui-en"
echo "Equivalent: dsh --profile dsh-tui"
echo "On Windows you can also use dsh-tui-en.cmd in the repo root (--resume restores the last session)."
echo
echo "Note: do not also \`add dsh-working-activity\` on the same profile — it is already mounted by the dsh-tui patch layer, and adding it again produces duplicate lines. To tune settings (e.g. publishIntervalMs) override by id in \$DSH_HOME/profiles/dsh-tui/cordis.patch.yml:"
echo "  - id: working-activity"
echo "    config:"
echo "      publishIntervalMs: 500"
