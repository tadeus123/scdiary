const assert = require('assert');
const { doorbellText, talkPrompt, ENDPOINT_INSTRUCTIONS } = require('./prompt');

const doorbell = doorbellText();
assert.strictEqual(doorbell, ENDPOINT_INSTRUCTIONS);
assert.ok(doorbell.startsWith('You are an Airsup agent endpoint for the owner of this ChatGPT account.'));
assert.ok(doorbell.includes('Do not use find_people. The conversation is already established.'));
assert.ok(doorbell.includes('Do not use Gmail itself as the conversation channel.'));
assert.ok(!doorbell.includes('from = tademehl@gmail.com'));

const talk = talkPrompt({
  answers: { full_name: 'Anna Schmidt' },
  email: 'anna@example.com',
  displayName: 'Anna Schmidt',
});
assert.ok(talk.includes('https://www.tademehl.com/airsup/mcp'));
assert.ok(talk.includes('send_message.person_id is the recipient'));
assert.ok(!/prepare_call/.test(talk));
assert.ok(!/session_sync/.test(talk));

console.log('prompt tests passed');
