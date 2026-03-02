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
    if (!token || token === 'null') return null;
    return token;
  } catch {
    return null;
  }
}

/**
 * Get the Claude Code OAuth access token for the current platform.
 * macOS: reads from system keychain
 * Linux/Windows: reads from ~/.claude/.credentials.json
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
