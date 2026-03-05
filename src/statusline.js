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
    let branch = '';
    try {
      branch = execSync('git branch --show-current', {
        encoding: 'utf8',
        cwd: currentDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      // ignore
    }
    if (!branch) {
      branch = execSync('git rev-parse --short HEAD', {
        encoding: 'utf8',
        cwd: currentDir,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    }

    if (branch) {
      let dirty = false;
      try {
        execSync('git diff --quiet', {
          cwd: currentDir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        execSync('git diff --cached --quiet', {
          cwd: currentDir,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const untracked = execSync(
          'git ls-files --others --exclude-standard',
          { encoding: 'utf8', cwd: currentDir, stdio: ['pipe', 'pipe', 'pipe'] }
        ).trim();
        if (untracked) dirty = true;
      } catch {
        dirty = true;
      }
      gitInfo = dirty ? ` ${branch}*` : ` ${branch}`;
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
    const usageResult = await getUsage(token);
    const usage = usageResult?.data;
    const rateLimitedUntil = usageResult?.rateLimitedUntil || 0;
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Format rate-limit countdown suffix
    let rlSuffix = '';
    if (rateLimitedUntil > nowEpoch) {
      const remaining = rateLimitedUntil - nowEpoch;
      const label = remaining >= 60 ? `${Math.ceil(remaining / 60)}m` : `${remaining}s`;
      rlSuffix = `${DIM} (429:${label})${RESET}`;
    }

    if (usage) {
      // 5-hour window
      const u5 = Math.floor(usage?.five_hour?.utilization ?? -1);
      if (u5 >= 0) {
        const resets5h = usage.five_hour.resets_at;
        let target5h = null;
        let resetLabel5h = '';
        if (resets5h) {
          const resetEpoch = Math.floor(new Date(resets5h).getTime() / 1000);
          target5h = computePacingTarget(nowEpoch, resetEpoch, 5 * 3600);
          resetLabel5h = `\u279e${formatResetLabel(resetEpoch)}`;
        }
        const u5Color = colorForPct(u5);
        const u5Bar = makeBar(u5, target5h, 10);
        usageParts = `${u5Color}5hr${resetLabel5h} ${u5Bar} ${u5}%${RESET}${rlSuffix}`;
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
          resetLabel7d = `\u279e${formatResetLabel(resetEpoch, true)}`;
        }
        const u7Color = colorForPct(u7);
        const u7Bar = makeBar(u7, target7d, 10);
        if (usageParts) usageParts += `${DIM} \u2502 ${RESET}`;
        usageParts += `${u7Color}wk${resetLabel7d} ${u7Bar} ${u7}%${RESET}${rlSuffix}`;
      }
    } else if (rateLimitedUntil > nowEpoch) {
      // No cached data at all, just show rate-limit message
      const remaining = rateLimitedUntil - nowEpoch;
      const label = remaining >= 60 ? `${Math.ceil(remaining / 60)}m` : `${remaining}s`;
      usageParts = `${DIM}\u23f3 429 rate limited, retry in ${label}${RESET}`;
    }
  }

  // Build final line
  let line = `${DIM}\x1b[96m${dirName}${RESET}${DIM}${gitInfo} \u2502 ${sessionCost}/${modelName} \u2502 ${ctxColor}ctx ${ctxBar} ${contextPct}%${RESET}`;
  if (usageParts) {
    line += `${DIM} \u2502 ${RESET}${usageParts}`;
  }

  process.stdout.write(line + '\n');
}

main().catch(() => process.exit(1));
