const assert = require('assert');
const {
  issueMatchId,
  openMatchId,
  issueConfirmationId,
  openConfirmation,
  issuePickup,
  openPickup,
  parsePickup,
  issueLineToken,
  openLineToken,
} = require('./match-ticket');

const requester = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const target = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const other = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const matchId = issueMatchId({ requesterId: requester, targetId: target });
assert.ok(matchId.startsWith('m.'));
assert.strictEqual(openMatchId(matchId, requester), target);

assert.throws(() => openMatchId(matchId, other));
assert.throws(() => openMatchId(target, requester));
assert.throws(() => openMatchId('m.nope.sig', requester));

const confirmationId = issueConfirmationId({
  requesterId: requester,
  targetId: target,
  opening: 'talk about the solar system',
});
assert.ok(confirmationId.startsWith('c.'));
assert.deepStrictEqual(openConfirmation(confirmationId, requester), {
  targetId: target,
  opening: 'talk about the solar system',
});
assert.throws(() => openConfirmation(confirmationId, other));
assert.throws(() => openConfirmation(matchId, requester));
assert.throws(() => openMatchId(confirmationId, requester));

const pickup = issuePickup({ callId: 'call_abc', endpointId: target });
assert.ok(pickup.startsWith('p.'));
assert.deepStrictEqual(openPickup(pickup), { callId: 'call_abc', endpointId: target });
assert.strictEqual(parsePickup(`hello\nPICKUP: ${pickup}\n`), pickup);
assert.throws(() => openPickup(matchId));

const line = issueLineToken({ callId: 'call_abc', endpointId: target });
assert.ok(line.startsWith('l.'));
assert.deepStrictEqual(openLineToken(line), { callId: 'call_abc', endpointId: target });
assert.throws(() => openLineToken(pickup));

console.log('match-ticket tests passed');
