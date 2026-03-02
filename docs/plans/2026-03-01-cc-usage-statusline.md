# cc-usage-statusline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** npm package that installs a cross-platform Node.js status line for Claude Code showing usage metrics.

**Architecture:** Pure Node.js rewrite with zero dependencies. CLI copies self-contained script to `~/.claude/`, patches `settings.json`. Statusline script reads JSON from stdin, fetches usage API, outputs ANSI-formatted status bar.

**Tech Stack:** Node.js (built-ins only: fs, path, os, child_process, https)

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `bin/cc-usage-statusline.js`

**Step 1: Create package.json**

```json
{
  "name": "cc-usage-statusline",
  "version": "1.0.0",
  "description": "Claude Code status line showing usage limits with color-coded progress bars",
  "main": "src/statusline.js",
  "bin": {
    "cc-usage-statusline": "bin/cc-usage-statusline.js"
  },
  "scripts": {
    "test": "node --test tests/"
  },
  "keywords": ["claude", "claude-code", "statusline", "usage", "anthropic"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "bin/",
    "src/"
  ]
}
```

**Step 2: Create .gitignore**

```
node_modules/
/tmp/
*.tgz
```

**Step 3: Create bin/cc-usage-statusline.js**

```javascript
#!/usr/bin/env node
const { run } = require('../src/cli.js');
run(process.argv.slice(2));
```

**Step 4: Commit**

```bash
git add package.json .gitignore bin/
git commit -m "chore: project scaffolding"
```

---

### Task 2: ANSI progress bar renderer (`src/bar.js`)

**Files:**
- Create: `src/bar.js`
- Create: `tests/bar.test.js`

**Step 1: Write the failing test**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeBar, colorForPct } = require('../src/bar.js');

describe('makeBar', () => {
  it('renders empty bar at 0%', () => {
    const bar = makeBar(0, null, 10);
    assert.strictEqual(bar, '░░░░░░░░░░');
  });

  it('renders full bar at 100%', () => {
    const bar = makeBar(100, null, 10);
    assert.strictEqual(bar, '▓▓▓▓▓▓▓▓▓▓');
  });

  it('renders 50% bar', () => {
    const bar = makeBar(50, null, 10);
    assert.strictEqual(bar, '▓▓▓▓▓░░░░░');
  });

  it('renders target marker', () => {
    const bar = makeBar(50, 30, 10);
    assert.ok(bar.includes('│'));
  });

  it('target marker replaces correct position', () => {
    const bar = makeBar(0, 50, 10);
    const idx = bar.indexOf('│');
    assert.strictEqual(idx, 5);
  });
});

describe('colorForPct', () => {
  it('returns green for <50', () => {
    assert.ok(colorForPct(30).includes('32'));
  });

  it('returns yellow for 50-79', () => {
    assert.ok(colorForPct(60).includes('33'));
  });

  it('returns red for >=80', () => {
    assert.ok(colorForPct(90).includes('91'));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/bar.test.js`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
/**
 * ANSI progress bar with optional pacing target marker.
 *
 * @param {number} pct - Percentage filled (0-100)
 * @param {number|null} targetPct - Pacing target percentage (0-99), or null
 * @param {number} width - Bar width in characters (default 10)
 * @returns {string} Bar string using ▓ (filled), ░ (empty), │ (target)
 */
function makeBar(pct, targetPct = null, width = 10) {
  let filled = Math.round((pct * width) / 100);
  if (filled > width) filled = width;

  let targetPos = -1;
  if (targetPct != null && targetPct >= 0 && targetPct < 100) {
    targetPos = Math.round((targetPct * width) / 100);
    if (targetPos > width) targetPos = width;
  }

  let bar = '';
  for (let i = 0; i < width; i++) {
    if (i === targetPos) {
      bar += '│';
    } else if (i < filled) {
      bar += '▓';
    } else {
      bar += '░';
    }
  }
  return bar;
}

/**
 * Return ANSI color escape for a percentage value.
 * Green (<50), yellow (50-79), bright red (>=80).
 */
function colorForPct(pct) {
  if (pct >= 80) return '\x1b[91m';
  if (pct >= 50) return '\x1b[33m';
  return '\x1b[2m\x1b[32m';
}

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

module.exports = { makeBar, colorForPct, RESET, DIM };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/bar.test.js`
Expected: All 7 tests PASS

**Step 5: Commit**

```bash
git add src/bar.js tests/bar.test.js
git commit -m "feat: add ANSI progress bar renderer"
```

---

### Task 3: Credential retrieval (`src/credentials.js`)

**Files:**
- Create: `src/credentials.js`
- Create: `tests/credentials.test.js`

**Step 1: Write the failing test**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseCredentials } = require('../src/credentials.js');

describe('parseCredentials', () => {
  it('extracts accessToken from valid JSON', () => {
    const json = JSON.stringify({
      claudeAiOauth: { accessToken: 'test-token-123' }
    });
    assert.strictEqual(parseCredentials(json), 'test-token-123');
  });

  it('returns null for missing claudeAiOauth', () => {
    assert.strictEqual(parseCredentials('{}'), null);
  });

  it('returns null for null accessToken', () => {
    const json = JSON.stringify({ claudeAiOauth: { accessToken: null } });
    assert.strictEqual(parseCredentials(json), null);
  });

  it('returns null for invalid JSON', () => {
    assert.strictEqual(parseCredentials('not-json'), null);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/credentials.test.js`
Expected: FAIL

**Step 3: Write implementation**

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Parse credentials JSON and extract the OAuth access token.
 * @param {string} json - Raw JSON string
 * @returns {string|null} Access token or null
 */
function parseCredentials(json) {
  try {
    const data = JSON.parse(json);
    const token = data?.claudeAiOauth?.accessToken;
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Get the Claude Code OAuth access token for the current platform.
 * @returns {string|null} Access token or null
 */
function getAccessToken() {
  // macOS: read from keychain
  if (process.platform === 'darwin') {
    try {
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
      return parseCredentials(raw);
    } catch {
      // Fall through to file-based approach
    }
  }

  // Linux, Windows, or macOS fallback: read credentials file
  const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    const raw = fs.readFileSync(credPath, 'utf8');
    return parseCredentials(raw);
  } catch {
    return null;
  }
}

module.exports = { getAccessToken, parseCredentials };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/credentials.test.js`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/credentials.js tests/credentials.test.js
git commit -m "feat: add platform-specific credential retrieval"
```

---

### Task 4: Usage API client with cache (`src/usage.js`)

**Files:**
- Create: `src/usage.js`
- Create: `tests/usage.test.js`

**Step 1: Write the failing test**

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { computePacingTarget, formatResetLabel } = require('../src/usage.js');

describe('computePacingTarget', () => {
  it('returns 50 when halfway through window', () => {
    const now = 5000;
    const resetEpoch = 10000;
    const windowSecs = 10000;
    assert.strictEqual(computePacingTarget(now, resetEpoch, windowSecs), 50);
  });

  it('clamps to 0 if before window start', () => {
    const now = 0;
    const resetEpoch = 20000;
    const windowSecs = 10000;
    assert.strictEqual(computePacingTarget(now, resetEpoch, windowSecs), 0);
  });

  it('clamps to 100 at window end', () => {
    const now = 20000;
    const resetEpoch = 10000;
    const windowSecs = 10000;
    assert.strictEqual(computePacingTarget(now, resetEpoch, windowSecs), 100);
  });
});

describe('formatResetLabel', () => {
  it('returns short relative time', () => {
    const label = formatResetLabel(Date.now() / 1000 + 3600);
    assert.ok(typeof label === 'string');
    assert.ok(label.length > 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test tests/usage.test.js`
Expected: FAIL

**Step 3: Write implementation**

```javascript
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_PATH = path.join(os.tmpdir(), 'claude-statusline-usage.json');
const CACHE_MAX_AGE_SECS = 60;

/**
 * Compute pacing target as percentage of window elapsed.
 */
function computePacingTarget(nowEpoch, resetEpoch, windowSecs) {
  const startEpoch = resetEpoch - windowSecs;
  let elapsed = nowEpoch - startEpoch;
  if (elapsed < 0) elapsed = 0;
  if (elapsed > windowSecs) elapsed = windowSecs;
  return Math.round((elapsed * 100) / windowSecs);
}

/**
 * Format a reset epoch as a short human-readable label.
 * e.g. "3pm", "Tue, 3pm"
 */
function formatResetLabel(resetEpochSecs, includeDay = false) {
  const d = new Date(resetEpochSecs * 1000);
  const hours = d.getHours();
  const ampm = hours >= 12 ? 'pm' : 'am';
  const h12 = hours % 12 || 12;
  const label = `${h12}${ampm}`;
  if (includeDay) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `${days[d.getDay()]},${label}`;
  }
  return label;
}

/**
 * Fetch usage data from Anthropic API.
 * @param {string} token - OAuth access token
 * @returns {Promise<object|null>} Usage data or null
 */
function fetchUsage(token) {
  return new Promise((resolve) => {
    const req = https.request(
      'https://api.anthropic.com/api/oauth/usage',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.error) return resolve(null);
            resolve(data);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Get usage data, using cache if fresh enough.
 * @param {string} token - OAuth access token
 * @returns {Promise<object|null>}
 */
async function getUsage(token) {
  // Check cache freshness
  try {
    const stat = fs.statSync(CACHE_PATH);
    const ageSecs = (Date.now() - stat.mtimeMs) / 1000;
    if (ageSecs < CACHE_MAX_AGE_SECS) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    }
  } catch {
    // No cache or can't read — fetch fresh
  }

  const data = await fetchUsage(token);
  if (data) {
    try {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(data));
    } catch {
      // Cache write failure is non-fatal
    }
  }
  return data;
}

module.exports = { getUsage, fetchUsage, computePacingTarget, formatResetLabel };
```

**Step 4: Run test to verify it passes**

Run: `node --test tests/usage.test.js`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/usage.js tests/usage.test.js
git commit -m "feat: add usage API client with caching"
```

---

### Task 5: Main statusline script (`src/statusline.js`)

**Files:**
- Create: `src/statusline.js`

**Step 1: Write implementation**

This is the main entry point that Claude Code invokes. It:
1. Reads JSON from stdin
2. Extracts context info (model, dir, git, context %)
3. Gets OAuth token
4. Fetches usage data (with cache)
5. Renders ANSI status line

```javascript
const { getAccessToken } = require('./credentials.js');
const { getUsage, computePacingTarget, formatResetLabel } = require('./usage.js');
const { makeBar, colorForPct, RESET, DIM } = require('./bar.js');
const { execSync } = require('child_process');
const path = require('path');

async function main() {
  // Read stdin JSON from Claude Code
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let ctx;
  try {
    ctx = JSON.parse(input);
  } catch {
    ctx = {};
  }

  const modelName = ctx?.model?.display_name || 'Claude';
  const currentDir = ctx?.workspace?.current_dir || process.cwd();
  const contextPct = Math.floor(ctx?.context_window?.used_percentage ?? 10);
  const sessionCost = `$${(ctx?.cost?.total_cost_usd ?? 0).toFixed(1)}`;
  const dirName = path.basename(currentDir);

  // Git info
  let gitInfo = '';
  try {
    const branch = execSync('git branch --show-current', {
      encoding: 'utf8',
      cwd: currentDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      cwd: currentDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (branch) {
      try {
        execSync('git diff --quiet && git diff --cached --quiet', {
          cwd: currentDir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const untracked = execSync(
          'git ls-files --others --exclude-standard',
          { encoding: 'utf8', cwd: currentDir, stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        gitInfo = untracked ? ` ${branch}*` : ` ${branch}`;
      } catch {
        gitInfo = ` ${branch}*`;
      }
    }
  } catch {
    // Not a git repo — no git info
  }

  // Context bar
  const ctxColor = colorForPct(contextPct);
  const ctxBar = makeBar(contextPct, null, 10);

  // Usage limits
  let usageParts = '';
  const token = getAccessToken();
  if (token) {
    const usage = await getUsage(token);
    if (usage) {
      const nowEpoch = Math.floor(Date.now() / 1000);

      // 5-hour window
      const u5 = Math.floor(usage?.five_hour?.utilization ?? -1);
      if (u5 >= 0) {
        const resets5h = usage.five_hour.resets_at;
        let target5h = null;
        let resetLabel5h = '';
        if (resets5h) {
          const resetEpoch = Math.floor(new Date(resets5h).getTime() / 1000);
          target5h = computePacingTarget(nowEpoch, resetEpoch, 5 * 3600);
          resetLabel5h = `➞${formatResetLabel(resetEpoch)}`;
        }
        const u5Color = colorForPct(u5);
        const u5Bar = makeBar(u5, target5h, 10);
        usageParts = `${u5Color}5hr${resetLabel5h} ${u5Bar} ${u5}%${RESET}`;
      }

      // 7-day window
      const u7 = Math.floor(usage?.seven_day?.utilization ?? -1);
      if (u7 >= 0) {
        const resets7d = usage.seven_day.resets_at;
        let target7d = null;
        let resetLabel7d = '';
        if (resets7d) {
          const resetEpoch = Math.floor(new Date(resets7d).getTime() / 1000);
          target7d = computePacingTarget(nowEpoch, resetEpoch, 7 * 86400);
          resetLabel7d = `➞${formatResetLabel(resetEpoch, true)}`;
        }
        const u7Color = colorForPct(u7);
        const u7Bar = makeBar(u7, target7d, 10);
        if (usageParts) usageParts += `${DIM} │ ${RESET}`;
        usageParts += `${u7Color}wk${resetLabel7d} ${u7Bar} ${u7}%${RESET}`;
      }
    }
  }

  // Build final line
  let line = `${DIM}\x1b[96m${dirName}${RESET}${DIM}${gitInfo} │ ${sessionCost}/${modelName} │ ${ctxColor}ctx ${ctxBar} ${contextPct}%${RESET}`;
  if (usageParts) {
    line += `${DIM} │ ${RESET}${usageParts}`;
  }

  process.stdout.write(line + '\n');
}

main().catch(() => process.exit(1));
```

**Step 2: Manual test**

Run: `echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":25}}' | node src/statusline.js`
Expected: Colored status line output

**Step 3: Commit**

```bash
git add src/statusline.js
git commit -m "feat: add main statusline script"
```

---

### Task 6: CLI installer (`src/cli.js`)

**Files:**
- Create: `src/cli.js`

**Step 1: Write implementation**

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const SCRIPT_DEST = path.join(CLAUDE_DIR, 'statusline-command.js');

function getScriptSource() {
  // Resolve absolute paths for the installed modules
  const statuslinePath = path.resolve(__dirname, 'statusline.js');
  const dir = path.dirname(statuslinePath);

  // Bundle: read all source files and create a self-contained script
  const barSrc = fs.readFileSync(path.join(dir, 'bar.js'), 'utf8');
  const credsSrc = fs.readFileSync(path.join(dir, 'credentials.js'), 'utf8');
  const usageSrc = fs.readFileSync(path.join(dir, 'usage.js'), 'utf8');
  const mainSrc = fs.readFileSync(path.join(dir, 'statusline.js'), 'utf8');

  // Wrap each module in a function and create a mini module system
  return `#!/usr/bin/env node
// Auto-generated by cc-usage-statusline — do not edit
// https://www.npmjs.com/package/cc-usage-statusline

const _modules = {};
const _cache = {};
function _require(name) {
  if (_cache[name]) return _cache[name].exports;
  const mod = { exports: {} };
  _cache[name] = mod;
  _modules[name](mod, mod.exports);
  return mod.exports;
}

_modules['./bar.js'] = function(module, exports) {
${barSrc.replace(/module\.exports/g, 'module.exports').replace(/require\([^)]+\)/g, (m) => m.replace('require', '_require'))}
};

_modules['./credentials.js'] = function(module, exports) {
${credsSrc.replace(/require\('\.\/[^']+'\)/g, (m) => m.replace('require', '_require')).replace(/require\('([^.][^']+)'\)/g, "require('$1')")}
};

_modules['./usage.js'] = function(module, exports) {
${usageSrc.replace(/require\('\.\/[^']+'\)/g, (m) => m.replace('require', '_require')).replace(/require\('([^.][^']+)'\)/g, "require('$1')")}
};

_modules['./statusline.js'] = function(module, exports) {
${mainSrc.replace(/require\('\.\/[^']+'\)/g, (m) => m.replace('require', '_require')).replace(/require\('([^.][^']+)'\)/g, "require('$1')")}
};

_require('./statusline.js');
`;
}

function install() {
  // Ensure ~/.claude exists
  if (!fs.existsSync(CLAUDE_DIR)) {
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  }

  // Write the bundled statusline script
  const script = getScriptSource();
  fs.writeFileSync(SCRIPT_DEST, script, { mode: 0o755 });
  console.log(`✓ Wrote statusline script to ${SCRIPT_DEST}`);

  // Patch settings.json
  let settings = {};
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch {
      // If settings.json is malformed, start fresh
    }
  }

  settings.statusLine = {
    type: 'command',
    command: `node ${SCRIPT_DEST}`,
  };

  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
  console.log(`✓ Updated ${SETTINGS_PATH}`);
  console.log('\nDone! Restart Claude Code to see your status line.');
}

function uninstall() {
  // Remove script
  if (fs.existsSync(SCRIPT_DEST)) {
    fs.unlinkSync(SCRIPT_DEST);
    console.log(`✓ Removed ${SCRIPT_DEST}`);
  }

  // Clean settings.json
  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      delete settings.statusLine;
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
      console.log(`✓ Cleaned ${SETTINGS_PATH}`);
    } catch {
      console.log('⚠ Could not clean settings.json');
    }
  }
}

function run(args) {
  const cmd = args[0];
  if (cmd === 'install') return install();
  if (cmd === 'uninstall') return uninstall();

  console.log('Usage: cc-usage-statusline <install|uninstall>');
  console.log('');
  console.log('Commands:');
  console.log('  install     Install the status line script and configure Claude Code');
  console.log('  uninstall   Remove the status line script and clean configuration');
  process.exit(cmd ? 1 : 0);
}

module.exports = { run, install, uninstall };
```

**Step 2: Test CLI manually**

Run: `node bin/cc-usage-statusline.js` (should print usage)
Run: `node bin/cc-usage-statusline.js install` (should install)
Run: `cat ~/.claude/settings.json` (should show statusLine config)
Run: `node bin/cc-usage-statusline.js uninstall` (should clean up)

**Step 3: Commit**

```bash
git add src/cli.js bin/cc-usage-statusline.js
git commit -m "feat: add CLI installer/uninstaller"
```

---

### Task 7: README and final packaging

**Files:**
- Create: `README.md`
- Create: `LICENSE`

**Step 1: Write README.md**

Include:
- What it does (one paragraph + screenshot description)
- Quick install: `npx cc-usage-statusline install`
- Uninstall: `npx cc-usage-statusline uninstall`
- Requirements: Node.js >= 18, active Claude Code subscription
- What the status line shows (dir, git, cost, model, context %, 5hr %, weekly %)
- Credit link to original gist
- License: MIT

**Step 2: Write LICENSE (MIT)**

**Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README and LICENSE"
```

---

### Task 8: End-to-end testing and publish prep

**Step 1: Run all tests**

Run: `node --test tests/`
Expected: All tests pass

**Step 2: Test full install flow**

```bash
node bin/cc-usage-statusline.js install
echo '{"model":{"display_name":"Opus"},"context_window":{"used_percentage":42}}' | node ~/.claude/statusline-command.js
node bin/cc-usage-statusline.js uninstall
```

**Step 3: Dry-run npm publish**

Run: `npm pack --dry-run` to verify included files are correct

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: ready for v1.0.0 publish"
```

**Step 5: Publish**

Run: `npm publish` (user must be logged in to npm)
