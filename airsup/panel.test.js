const assert = require('assert');
const { createMemoryStore } = require('./store-memory');
const { createConversations } = require('./conversations');
const { conversationPanel, conversationResourceContents, THREADS_URI } = require('./panel');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const store = createMemoryStore();
  const wakes = [];
  const conv = createConversations({
    store,
    mailer: {
      async sendWakeEmail(payload) {
        wakes.push(payload);
      },
    },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
  const tade = await store.upsertPerson({
    googleId: 'g-tade',
    email: 'tademehl@gmail.com',
    displayName: 'Tade Mehl',
  });
  const anna = await store.upsertPerson({
    googleId: 'g-anna',
    email: 'tm9sko@gmail.com',
    displayName: 'Anna Schmidt',
  });

  const tadeWait = conv.sendMessage(tade.person_id, { person_id: anna.person_id, message: 'hello anna' });
  await delay(20);
  const conversationId = wakes[0].conversationId;
  const annaWait = conv.sendMessage(anna.person_id, { conversation_id: conversationId, message: 'hello tade' });
  const tadeFirst = await tadeWait;
  assert.strictEqual(tadeFirst.status, 'replied');
  assert.deepStrictEqual(Object.keys(tadeFirst).sort(), ['conversation_id', 'reply', 'status']);

  const panel = await conversationPanel(store, tade.person_id, conversationId);
  assert.strictEqual(panel.other.name, 'Anna Schmidt');
  assert.strictEqual(panel.you.name, 'Tade Mehl');
  assert.strictEqual(panel.messages.length, 2);
  assert.strictEqual(panel.messages[0].from, 'you');
  assert.strictEqual(panel.messages[0].body, 'hello anna');
  assert.strictEqual(panel.messages[1].from, 'them');
  assert.strictEqual(panel.messages[1].body, 'hello tade');
  assert.strictEqual(panel.threads.length, 1);
  const fast = await conversationPanel(store, tade.person_id, conversationId, { includeThreads: false });
  assert.strictEqual(fast.messages.length, 2);
  assert.deepStrictEqual(fast.threads, []);

  const listed = await conversationResourceContents(store, tade.person_id, THREADS_URI);
  const threads = JSON.parse(listed.contents[0].text);
  assert.strictEqual(threads.threads[0].other.name, 'Anna Schmidt');

  const one = await conversationResourceContents(store, tade.person_id, THREADS_URI + '/' + conversationId);
  const opened = JSON.parse(one.contents[0].text);
  assert.strictEqual(opened.messages[1].body, 'hello tade');

  await conv.endConversation(tade.person_id, conversationId);
  await annaWait;
  const ended = await conversationPanel(store, tade.person_id, conversationId);
  assert.strictEqual(ended.status, 'ended');

  console.log('panel tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
