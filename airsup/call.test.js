const assert = require('assert');
const { isRingMessage, parseCallId, roleOnCall } = require('./call');

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

console.log('call doorbell tests passed');
