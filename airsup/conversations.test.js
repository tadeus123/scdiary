const assert = require('assert');
const { createMemoryStore } = require('./store-memory');
const { createConversations } = require('./conversations');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function make({ sleep } = {}) {
  const store = createMemoryStore();
  const wakes = [];
  const mailer = {
    async sendWakeEmail(payload) {
      wakes.push(payload);
    },
  };
  const conv = createConversations({
    store,
    mailer,
    sleep: sleep || (() => new Promise((resolve) => setTimeout(resolve, 5))),
  });
  return { store, wakes, conv };
}

(async () => {
  const { store, wakes, conv } = make();
  const tade = await store.upsertPerson({
    googleId: 'g-tade',
    email: 'tademehl@gmail.com',
    displayName: 'Tade Mehl',
    listing: { answers: { full_name: 'Tade Mehl', help_others: 'builds Airsup' } },
  });
  const anna = await store.upsertPerson({
    googleId: 'g-anna',
    email: 'tm9sko@gmail.com',
    displayName: 'Anna Schmidt',
    listing: { answers: { full_name: 'Anna Schmidt' } },
  });

  const tadeWait = conv.sendMessage(tade.person_id, { person_id: anna.person_id, message: 'hello anna' });
  await delay(20);
  assert.strictEqual(wakes.length, 1);
  const conversationId = wakes[0].conversationId;
  assert.strictEqual(wakes[0].to, 'tm9sko@gmail.com');

  const annaWait = conv.sendMessage(anna.person_id, { conversation_id: conversationId, message: 'hello tade' });
  const tadeFirst = await tadeWait;
  assert.strictEqual(tadeFirst.status, 'replied');
  assert.strictEqual(tadeFirst.reply, 'hello tade');

  const tadeSecond = conv.sendMessage(tade.person_id, { conversation_id: conversationId, message: 'second turn' });
  const annaFirst = await annaWait;
  assert.strictEqual(annaFirst.status, 'replied');
  assert.strictEqual(annaFirst.reply, 'second turn');
  assert.strictEqual(wakes.length, 1);

  const ended = await conv.endConversation(tade.person_id, conversationId);
  assert.strictEqual(ended.status, 'ended');
  const annaEnded = await tadeSecond;
  assert.strictEqual(annaEnded.status, 'ended');

  const afterEnd = await conv.sendMessage(anna.person_id, { conversation_id: conversationId, message: 'too late' });
  assert.strictEqual(afterEnd.status, 'failed');

  const self = await conv.sendMessage(tade.person_id, { person_id: tade.person_id, message: 'nope' });
  assert.strictEqual(self.status, 'failed');

  let failWake = true;
  const store2 = createMemoryStore();
  const wakes2 = [];
  const a = await store2.upsertPerson({ googleId: 'a', email: 'a@x.com', displayName: 'A' });
  const b = await store2.upsertPerson({ googleId: 'b', email: 'b@x.com', displayName: 'B' });
  const failing = createConversations({
    store: store2,
    mailer: {
      async sendWakeEmail(payload) {
        if (failWake) throw new Error('mail down');
        wakes2.push(payload);
      },
    },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
  const failedStart = await failing.sendMessage(a.person_id, { person_id: b.person_id, message: 'ping' });
  assert.strictEqual(failedStart.status, 'failed');
  assert.ok(failedStart.conversation_id);
  failWake = false;
  const resume = failing.sendMessage(a.person_id, {
    conversation_id: failedStart.conversation_id,
    message: 'ignored-on-resume',
  });
  await delay(20);
  const bReply = failing.sendMessage(b.person_id, {
    conversation_id: failedStart.conversation_id,
    message: 'pong',
  });
  const resumed = await resume;
  assert.strictEqual(wakes2.length, 1);
  assert.strictEqual(resumed.status, 'replied');
  assert.strictEqual(resumed.reply, 'pong');
  await failing.endConversation(a.person_id, failedStart.conversation_id);
  await bReply;

  const store3 = createMemoryStore();
  const wakes3 = [];
  const p1 = await store3.upsertPerson({ googleId: 'p1', email: 'p1@x.com', displayName: 'P1' });
  const p2 = await store3.upsertPerson({ googleId: 'p2', email: 'p2@x.com', displayName: 'P2' });
  const mailer3 = { async sendWakeEmail(payload) { wakes3.push(payload); } };
  const hung = createConversations({
    store: store3,
    mailer: mailer3,
    sleep: () => new Promise(() => {}),
  });
  const live = createConversations({
    store: store3,
    mailer: mailer3,
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
  hung.sendMessage(p1.person_id, { person_id: p2.person_id, message: 'are you there' });
  await delay(20);
  const parkedId = wakes3[0].conversationId;
  const p2Wait = live.sendMessage(p2.person_id, { conversation_id: parkedId, message: 'parked-reply' });
  await delay(20);
  const drained = await live.sendMessage(p1.person_id, { conversation_id: parkedId, message: 'should-not-send' });
  assert.strictEqual(drained.status, 'replied');
  assert.strictEqual(drained.reply, 'parked-reply');
  await live.endConversation(p1.person_id, parkedId);
  assert.strictEqual((await p2Wait).status, 'ended');

  console.log('conversation tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
