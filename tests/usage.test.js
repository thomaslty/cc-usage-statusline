const { describe, it } = require('node:test');
const assert = require('node:assert');
const { computePacingTarget, formatResetLabel } = require('../src/usage.js');

describe('computePacingTarget', () => {
  it('returns 0 when at window start', () => {
    // now = start, reset = start + window
    assert.strictEqual(computePacingTarget(1000, 11000, 10000), 0);
  });

  it('returns 50 when halfway through window', () => {
    assert.strictEqual(computePacingTarget(6000, 11000, 10000), 50);
  });

  it('returns 100 at window end', () => {
    assert.strictEqual(computePacingTarget(11000, 11000, 10000), 100);
  });

  it('clamps to 0 if before window start', () => {
    assert.strictEqual(computePacingTarget(500, 11000, 10000), 0);
  });

  it('clamps to 100 if after window end', () => {
    assert.strictEqual(computePacingTarget(15000, 11000, 10000), 100);
  });
});

describe('formatResetLabel', () => {
  it('returns short time like "3pm"', () => {
    // Create a date at 3pm
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    const label = formatResetLabel(d.getTime() / 1000);
    assert.strictEqual(label, '3pm');
  });

  it('returns 12pm for noon', () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const label = formatResetLabel(d.getTime() / 1000);
    assert.strictEqual(label, '12pm');
  });

  it('returns 12am for midnight', () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const label = formatResetLabel(d.getTime() / 1000);
    assert.strictEqual(label, '12am');
  });

  it('includes day when includeDay=true', () => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    const label = formatResetLabel(d.getTime() / 1000, true);
    assert.ok(label.includes(','));
    assert.ok(label.endsWith('3pm'));
  });
});
