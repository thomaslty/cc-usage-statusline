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
