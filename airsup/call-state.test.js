const assert = require('assert');
const {
  hangupNext,
  filterNewFromOther,
  pollInstruction,
  parseCallId,
  isRingMessage,
  isUuid,
} = require('./call-state');

const call = {
  call_id: 'call_1',
  caller_endpoint: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  callee_endpoint: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'live',
  caller_hangup: false,
  callee_hangup: false,
  last_seq: 2,
};

const afterCaller = hangupNext(call, call.caller_endpoint);
assert.strictEqual(afterCaller.status, 'ending');
assert.strictEqual(afterCaller.caller_hangup, true);
assert.strictEqual(afterCaller.callee_hangup, false);

const afterBoth = hangupNext(afterCaller, call.callee_endpoint);
assert.strictEqual(afterBoth.status, 'ended');
assert.strictEqual(afterBoth.caller_hangup, true);
assert.strictEqual(afterBoth.callee_hangup, true);

const ring = { ...call, status: 'ringing', caller_hangup: false, callee_hangup: false };
assert.strictEqual(hangupNext(ring, call.caller_endpoint).status, 'ended');

const others = filterNewFromOther([
  { from_endpoint: call.caller_endpoint, kind: 'chat', body: 'hi' },
  { from_endpoint: call.callee_endpoint, kind: 'chat', body: 'yo' },
  { from_endpoint: call.caller_endpoint, kind: 'system', body: 'noise' },
], call.caller_endpoint);
assert.strictEqual(others.length, 1);
assert.strictEqual(others[0].body, 'yo');

const endedPoll = pollInstruction({ ...call, status: 'ended' }, call.caller_endpoint);
assert.strictEqual(endedPoll.must_call_again, false);

const livePoll = pollInstruction(call, call.caller_endpoint);
assert.strictEqual(livePoll.must_call_again, true);

assert.strictEqual(isRingMessage({ subject: '[A2A-RING] call_1', body: '' }), true);
assert.strictEqual(parseCallId({ subject: '[A2A-RING] call_1', body: '' }), 'call_1');
assert.strictEqual(isUuid(call.caller_endpoint), true);
assert.strictEqual(isUuid('not-a-uuid'), false);
assert.strictEqual(isUuid('(not registered yet)'), false);

console.log('call state tests passed');
