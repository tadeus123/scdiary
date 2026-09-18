const assert = require('assert');
const { computeScore, computeWpm, isPlausibleRun, ROUND_SECONDS } = require('./score');
const { PHRASES } = require('./phrases');

assert.strictEqual(ROUND_SECONDS, 45);
assert.strictEqual(computeScore(0, 0), 0);
assert.strictEqual(computeScore(61.4, 2), 574); // round(614) - 40
assert.strictEqual(computeScore(80, 0), 800);
assert.strictEqual(computeScore(80, 50), 0);
assert.ok(Math.abs(computeWpm(50, 60000) - 10) < 1e-9);
assert.strictEqual(computeWpm(0, 1000), 0);
assert.ok(isPlausibleRun({ wpm: 80, mistakes: 1, score: 780 }));
assert.ok(!isPlausibleRun({ wpm: 80, mistakes: 1, score: 800 }));
assert.ok(!isPlausibleRun({ wpm: -1, mistakes: 0, score: 0 }));
assert.ok(PHRASES.length >= 30);
assert.ok(PHRASES.every((line) => typeof line === 'string' && line.length > 12 && !line.includes('\n')));

console.log('games tests passed');
