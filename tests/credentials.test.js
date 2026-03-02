const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseCredentials } = require('../src/credentials.js');

describe('parseCredentials', () => {
  it('extracts accessToken from valid JSON', () => {
    const json = JSON.stringify({
      claudeAiOauth: { accessToken: 'test-token-123' },
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

  it('returns null for empty string accessToken', () => {
    const json = JSON.stringify({ claudeAiOauth: { accessToken: '' } });
    assert.strictEqual(parseCredentials(json), null);
  });

  it('returns null for "null" string token', () => {
    const json = JSON.stringify({ claudeAiOauth: { accessToken: 'null' } });
    assert.strictEqual(parseCredentials(json), null);
  });

  it('returns null for invalid JSON', () => {
    assert.strictEqual(parseCredentials('not-json'), null);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(parseCredentials(''), null);
  });
});
