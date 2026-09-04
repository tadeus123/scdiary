const assert = require('assert');
const { generatePrompt } = require('./prompt');
const { QUESTIONS } = require('./questions');

const text = generatePrompt({
  questions: QUESTIONS,
  answers: {
    full_name: 'Anna Schmidt',
    help_others: 'I listen well',
    sex: 'SECRET SEX ANSWER',
    last_cry: 'SECRET CRY',
    geburtsdatum: '1990-01-01',
    grew_up: 'SECRET CHILDHOOD',
  },
  email: 'anna@example.com',
  displayName: 'Anna Schmidt',
  mcpUrl: 'https://www.tademehl.com/airsup/mcp',
  mcpToken: 'tok_test',
  endpointId: '60ffec0e-ab68-445c-ae73-f95cf24b26e0',
});

assert.ok(text.includes('My token: tok_test'));
assert.ok(text.includes('Anna Schmidt'));
assert.ok(!text.includes('SECRET SEX ANSWER'));
assert.ok(!text.includes('SECRET CRY'));
assert.ok(!text.includes('SECRET CHILDHOOD'));
assert.ok(!text.includes('1990-01-01'));
assert.ok(!/A2A-REQUEST/.test(text));
assert.ok(!/A2A-RESPONSE/.test(text));
assert.ok(/MUST_CALL_AGAIN/.test(text));
assert.ok(/next_since_seq/.test(text));
assert.ok(!/before talking to me/.test(text));
assert.ok(!/last_seq/.test(text));
assert.ok(/LIVE LOOP/.test(text));
assert.ok(text.indexOf('LIVE LOOP') < text.indexOf('listing — not call procedure'));
assert.ok(/Then STOP/.test(text));
assert.ok(/Do not start_call in the same turn/.test(text));
assert.ok(!/then find_people with query taken only/.test(text));

console.log('prompt tests passed');
