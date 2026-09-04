const assert = require('assert');
const {
  hangupNext,
  filterNewFromOther,
  splitFromOther,
  parseSinceSeq,
  pollInstruction,
  shapeSessionSync,
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
assert.strictEqual(hangupNext(ring, call.callee_endpoint).status, 'ended');

const others = filterNewFromOther([
  { from_endpoint: call.caller_endpoint, kind: 'chat', body: 'hi' },
  { from_endpoint: call.callee_endpoint, kind: 'chat', body: 'yo' },
  { from_endpoint: call.caller_endpoint, kind: 'system', body: 'noise' },
], call.caller_endpoint);
assert.strictEqual(others.length, 1);
assert.strictEqual(others[0].body, 'yo');

const split = splitFromOther([
  { from_endpoint: call.callee_endpoint, kind: 'chat', body: 'yo' },
  { from_endpoint: call.callee_endpoint, kind: 'system', body: 'Callee picked up. The line is live.' },
  { from_endpoint: call.caller_endpoint, kind: 'chat', body: 'mine' },
], call.caller_endpoint);
assert.deepStrictEqual(split.speech.map((row) => row.body), ['yo']);
assert.strictEqual(split.events.length, 1);

const endedPoll = pollInstruction({ ...call, status: 'ended' }, call.caller_endpoint);
assert.strictEqual(endedPoll.must_call_again, false);

const liveEmpty = pollInstruction(call, call.caller_endpoint, { speechCount: 0 });
assert.strictEqual(liveEmpty.must_call_again, true);
assert.ok(!/before chatting/.test(liveEmpty.instruction));
assert.ok(/next_since_seq/.test(liveEmpty.instruction));

const liveSpeech = pollInstruction(call, call.caller_endpoint, { speechCount: 1 });
assert.strictEqual(liveSpeech.must_call_again, false);
assert.ok(/Relay ONLY new_from_other/.test(liveSpeech.instruction));

assert.strictEqual(parseSinceSeq(undefined).ok, false);
assert.strictEqual(parseSinceSeq(null).ok, false);
assert.strictEqual(parseSinceSeq('').ok, false);
assert.deepStrictEqual(parseSinceSeq(0), { ok: true, value: 0 });
assert.deepStrictEqual(parseSinceSeq('3'), { ok: true, value: 3 });

const shaped = shapeSessionSync({
  call,
  endpointId: call.caller_endpoint,
  incoming: [
    { from_endpoint: call.caller_endpoint, kind: 'chat', body: 'opening' },
    { from_endpoint: call.callee_endpoint, kind: 'chat', body: 'hello from anna' },
    { from_endpoint: call.callee_endpoint, kind: 'system', body: 'Callee picked up. The line is live.' },
  ],
});
assert.strictEqual(shaped.must_call_again, false);
assert.deepStrictEqual(shaped.new_from_other.map((row) => row.body), ['hello from anna']);
assert.strictEqual(shaped.events.length, 1);
assert.strictEqual(shaped.next_since_seq, 2);
assert.ok(!shaped.messages);
assert.ok(!('last_seq' in shaped.call));

const goodbye = pollInstruction(
  { ...call, caller_hangup: false, callee_hangup: true },
  call.caller_endpoint,
  { speechCount: 1 }
);
assert.strictEqual(goodbye.must_call_again, false);
assert.ok(/hang_up/.test(goodbye.instruction));

const ringSpeech = pollInstruction(
  { ...call, status: 'ringing' },
  call.callee_endpoint,
  { speechCount: 1 }
);
assert.strictEqual(ringSpeech.must_call_again, false);

const emptyShaped = shapeSessionSync({
  call,
  endpointId: call.caller_endpoint,
  incoming: [
    { from_endpoint: call.caller_endpoint, kind: 'chat', body: 'opening' },
  ],
});
assert.strictEqual(emptyShaped.must_call_again, true);
assert.deepStrictEqual(emptyShaped.new_from_other, []);

assert.strictEqual(isRingMessage({ subject: '[A2A-RING] call_1', body: '' }), true);
assert.strictEqual(parseCallId({ subject: '[A2A-RING] call_1', body: '' }), 'call_1');
assert.strictEqual(isUuid(call.caller_endpoint), true);
assert.strictEqual(isUuid('not-a-uuid'), false);
assert.strictEqual(isUuid('(not registered yet)'), false);

console.log('call state tests passed');
