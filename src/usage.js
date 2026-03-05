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
 * @returns {Promise<{data: object|null, rateLimited: boolean, retryAfter: number}>}
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
        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'], 10) || 60;
          res.resume();
          return resolve({ data: null, rateLimited: true, retryAfter });
        }
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.error) return resolve({ data: null, rateLimited: false, retryAfter: 0 });
            resolve({ data, rateLimited: false, retryAfter: 0 });
          } catch {
            resolve({ data: null, rateLimited: false, retryAfter: 0 });
          }
        });
      }
    );
    req.on('error', () => resolve({ data: null, rateLimited: false, retryAfter: 0 }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ data: null, rateLimited: false, retryAfter: 0 });
    });
    req.end();
  });
}

/**
 * Get usage data, using cache if fresh enough.
 * Returns { data, rateLimitedUntil } where rateLimitedUntil is epoch secs (0 if not limited).
 * @param {string} token - OAuth access token
 * @returns {Promise<{data: object|null, rateLimitedUntil: number}>}
 */
async function getUsage(token) {
  let cache = null;
  try {
    cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    // No cache or can't read
  }

  const nowSecs = Math.floor(Date.now() / 1000);

  // If cache is fresh, return it
  if (cache && cache.fetchedAt && (nowSecs - cache.fetchedAt) < CACHE_MAX_AGE_SECS) {
    return { data: cache.data, rateLimitedUntil: cache.rateLimitedUntil || 0 };
  }

  // If still within rate-limit backoff, skip fetch and return stale data
  if (cache && cache.rateLimitedUntil && nowSecs < cache.rateLimitedUntil) {
    return { data: cache.data || null, rateLimitedUntil: cache.rateLimitedUntil };
  }

  const result = await fetchUsage(token);

  if (result.rateLimited) {
    const rateLimitedUntil = nowSecs + result.retryAfter;
    const newCache = {
      data: cache?.data || null,
      fetchedAt: cache?.fetchedAt || 0,
      rateLimitedUntil,
    };
    try { fs.writeFileSync(CACHE_PATH, JSON.stringify(newCache)); } catch {}
    return { data: newCache.data, rateLimitedUntil };
  }

  if (result.data) {
    const newCache = { data: result.data, fetchedAt: nowSecs, rateLimitedUntil: 0 };
    try { fs.writeFileSync(CACHE_PATH, JSON.stringify(newCache)); } catch {}
    return { data: result.data, rateLimitedUntil: 0 };
  }

  // Other failure — return stale cache if available
  return { data: cache?.data || null, rateLimitedUntil: 0 };
}

module.exports = { getUsage, fetchUsage, computePacingTarget, formatResetLabel };
