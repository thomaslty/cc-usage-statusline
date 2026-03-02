# cc-usage-statusline

Claude Code status line showing real-time usage metrics with color-coded progress bars.

Displays: directory, git branch, session cost, model, context window %, 5-hour rolling limit %, and 7-day rolling limit % — all with pacing targets so you know if you're ahead or behind your usage budget.

```
project-name main* │ $1.5/Opus │ ctx ▓▓▓▓░░░░░░ 42% │ 5hr➞3pm ▓▓▓│░░░░░░ 37% │ wk➞Tue,3pm ▓▓░│░░░░░░ 26%
```

Colors: green (<50%), yellow (50-80%), red (>80%). The `│` marker shows where even pacing would put you.

## Install

```bash
npx cc-usage-statusline install
```

Restart Claude Code. That's it.

## Uninstall

```bash
npx cc-usage-statusline uninstall
```

## What it does

1. Writes a self-contained status line script to `~/.claude/statusline-command.js`
2. Patches `~/.claude/settings.json` to enable it

The installed script has zero dependencies — it uses only Node.js built-ins.

## Requirements

- Node.js >= 18
- Active Claude Code subscription (for usage API access)

## Platform support

- macOS (reads OAuth token from system keychain)
- Linux (reads from `~/.claude/.credentials.json`)
- Windows (reads from `~/.claude/.credentials.json`)

## Credits

Based on [this gist](https://gist.github.com/thomaslty/72a86a5d539e8bca101ecc1528dc0948) by [@thomaslty](https://github.com/thomaslty).

## License

MIT
