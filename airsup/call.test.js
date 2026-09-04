const assert = require('assert');
const { isRingMessage, parseCallId, roleOnCall, doorbellEmail } = require('./call');

assert.strictEqual(
  isRingMessage({ subject: '[A2A-RING] call_abc', body: '' }),
  true
);
assert.strictEqual(
  isRingMessage({ subject: '[A2A-REQUEST] req_1', body: '' }),
  false
);
assert.strictEqual(
  parseCallId({ subject: '[A2A-RING] call_abc', body: 'CALL-ID: other' }),
  'call_abc'
);
assert.strictEqual(
  roleOnCall(
    { caller_endpoint: 'aaa', callee_endpoint: 'bbb' },
    'bbb'
  ),
  'callee'
);
assert.strictEqual(
  roleOnCall(
    { caller_endpoint: 'aaa', callee_endpoint: 'bbb' },
    'zzz'
  ),
  null
);

const doorbell = doorbellEmail({
  call: { call_id: 'call_abc' },
  from: { endpoint_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  to: { endpoint_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', endpoint_email: 'b@example.com' },
  opening: 'hi',
});
assert.strictEqual(doorbell.send_as, 'new_message');
assert.ok(doorbell.body.includes('handle_ring'));
assert.ok(!doorbell.body.includes('join_call'));
assert.ok(doorbell.body.includes('YOUR token'));
assert.ok(!doorbell.body.toLowerCase().includes('tok_'));

console.log('call doorbell tests passed');
