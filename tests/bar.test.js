const { describe, it } = require('node:test');
const assert = require('node:assert');
const { makeBar, colorForPct, RESET, DIM } = require('../src/bar.js');

describe('makeBar', () => {
  it('renders empty bar at 0%', () => {
    assert.strictEqual(makeBar(0, null, 10), '░░░░░░░░░░');
  });

  it('renders full bar at 100%', () => {
    assert.strictEqual(makeBar(100, null, 10), '▓▓▓▓▓▓▓▓▓▓');
  });

  it('renders 50% bar', () => {
    assert.strictEqual(makeBar(50, null, 10), '▓▓▓▓▓░░░░░');
  });

  it('clamps filled above width', () => {
    assert.strictEqual(makeBar(120, null, 10), '▓▓▓▓▓▓▓▓▓▓');
  });

  it('renders target marker at correct position', () => {
    const bar = makeBar(0, 50, 10);
    assert.strictEqual(bar.indexOf('│'), 5);
  });

  it('target marker replaces filled cell', () => {
    const bar = makeBar(80, 30, 10);
    assert.ok(bar.includes('│'));
    // marker at position 3, filled up to 8
    assert.strictEqual(bar[3], '│');
  });

  it('skips target if null', () => {
    const bar = makeBar(50, null, 10);
    assert.ok(!bar.includes('│'));
  });

  it('skips target if >= 100', () => {
    const bar = makeBar(50, 100, 10);
    assert.ok(!bar.includes('│'));
  });

  it('uses default width of 10', () => {
    const bar = makeBar(50);
    assert.strictEqual(bar.length, 10);
  });
});

describe('colorForPct', () => {
  it('returns dim green for <50', () => {
    const c = colorForPct(30);
    assert.ok(c.includes('32m'));
  });

  it('returns yellow for 50-79', () => {
    const c = colorForPct(60);
    assert.ok(c.includes('33m'));
  });

  it('returns bright red for >=80', () => {
    const c = colorForPct(90);
    assert.ok(c.includes('91m'));
  });

  it('boundary: 50 is yellow', () => {
    assert.ok(colorForPct(50).includes('33m'));
  });

  it('boundary: 80 is red', () => {
    assert.ok(colorForPct(80).includes('91m'));
  });
});

describe('constants', () => {
  it('RESET is escape sequence', () => {
    assert.ok(RESET.includes('0m'));
  });

  it('DIM is escape sequence', () => {
    assert.ok(DIM.includes('2m'));
  });
});
