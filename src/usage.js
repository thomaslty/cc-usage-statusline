const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_PATH = path.join(os.tmpdir(), 'claude-statusline-usage.json');
const CACHE_MAX_AGE_SECS = 60;

/**
 * Compute pacing target as percentage of window elapsed.
 * @param {number} nowEpoch - Current time in seconds
 * @param {number} resetEpoch - When the window resets in seconds
 * @param {number} windowSecs - Total window duration in seconds
 * @returns {number} Percentage (0-100)
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
 * e.g. "3pm", "Tue,3pm"
 * @param {number} resetEpochSecs - Reset time in seconds
 * @param {boolean} includeDay - Whether to include day of week
 * @returns {string}
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
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
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
