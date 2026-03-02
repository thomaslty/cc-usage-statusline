# cc-usage-statusline — Design Document

## Goal

npm package that installs a Node.js-based Claude Code status line showing context window usage, 5-hour rolling limits, and 7-day rolling limits with color-coded progress bars. Cross-platform (macOS, Linux, Windows).

## Architecture

Pure Node.js rewrite of the [original bash gist](https://gist.github.com/thomaslty/72a86a5d539e8bca101ecc1528dc0948). The npm package provides a CLI with `install` and `uninstall` commands. On install, it copies a self-contained statusline script to `~/.claude/` and patches `settings.json`. Zero runtime dependencies — Node.js built-ins only.

## Modules

| Module | Responsibility |
|--------|---------------|
| `src/statusline.js` | Main entry — reads stdin JSON, orchestrates output |
| `src/credentials.js` | Platform-specific OAuth token retrieval |
| `src/usage.js` | Fetches Anthropic usage API, caches for 60s |
| `src/bar.js` | ANSI progress bar rendering with pacing markers |
| `src/cli.js` | `install` / `uninstall` commands |

## Platform-specific credential access

| Platform | Method |
|----------|--------|
| macOS | `security find-generic-password -s "Claude Code-credentials" -w` via `execSync` |
| Linux/WSL | Read `~/.claude/.credentials.json` |
| Windows | Read `~/.claude/.credentials.json` |

## User experience

```
$ npx cc-usage-statusline install
✓ Wrote statusline script to ~/.claude/statusline-command.js
✓ Updated ~/.claude/settings.json
Done! Restart Claude Code to see your status line.

$ npx cc-usage-statusline uninstall
✓ Removed statusline script
✓ Cleaned settings.json
```

## Key constraints

- Zero runtime dependencies (Node.js built-ins only)
- Self-contained statusline script (no dependency on global npm install after setup)
- Cache usage API results to `os.tmpdir()/claude-statusline-usage.json` for 60s
- Same ANSI output format as original gist
