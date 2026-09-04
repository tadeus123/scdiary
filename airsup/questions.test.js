const assert = require('assert');
const { QUESTIONS, normalizeAnswers } = require('./questions');

assert.strictEqual(
  QUESTIONS.filter((q) => q.id.startsWith('sex')).length,
  1
);
assert.ok(!QUESTIONS.some((q) => /help other people with something/i.test(q.text)));
assert.ok(!QUESTIONS.some((q) => /kind and types of person/i.test(q.text)));
assert.ok(QUESTIONS.some((q) => q.text === 'what can you actually do for someone'));
assert.ok(QUESTIONS.some((q) => q.text === 'who do you want to sit with'));
assert.ok(/How did you grew up/.test(QUESTIONS.find((q) => q.id === 'grew_up').text));
assert.ok(/When did you cried/.test(QUESTIONS.find((q) => q.id === 'last_cry').text));

const merged = normalizeAnswers({
  sex_like: 'slow',
  sex_frequency: 'often',
  sex_life: 'good',
});
assert.ok(merged.sex.includes('slow'));
assert.ok(merged.sex.includes('often'));
assert.ok(merged.sex.includes('good'));

const kept = normalizeAnswers({
  sex: 'already wrote this',
  sex_like: 'old',
});
assert.strictEqual(kept.sex, 'already wrote this');

console.log('questions tests passed');
