const assert = require('assert');
const { createMemoryStore, sha256, randomToken } = require('./store-memory');
const { createMcp, toolList } = require('./mcp');
const { wakeBody, wakeSubject } = require('./mail');

(async () => {
  const names = toolList().tools.map((tool) => tool.name);
  assert.deepStrictEqual(names, ['find_people', 'send_message', 'end_conversation']);
  assert.ok(toolList().tools[1].description.includes('Provide exactly one of person_id or conversation_id'));
  assert.ok(toolList().tools[2].description.includes('Do not use this merely because you are temporarily waiting'));

  const store = createMemoryStore();
  const tade = await store.upsertPerson({
    googleId: 'g-tade',
    email: 'tademehl@gmail.com',
    displayName: 'Tade Mehl',
    listing: { answers: { full_name: 'Tade Mehl', help_others: 'Airsup' } },
  });
  const anna = await store.upsertPerson({
    googleId: 'g-anna',
    email: 'tm9sko@gmail.com',
    displayName: 'Anna Schmidt',
  });
  const access = randomToken('as_', 8);
  await store.insertPluginToken({
    tokenHash: sha256(access),
    refreshHash: sha256('rf'),
    personId: tade.person_id,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  const mcp = createMcp({
    store,
    mailer: { async sendWakeEmail() {} },
    sleep: () => new Promise((resolve) => setTimeout(resolve, 5)),
  });
  const found = await mcp.callTool('find_people', tade, { query: 'Anna' });
  assert.strictEqual(found.matches[0].person_id, anna.person_id);

  const body = wakeBody({
    conversationId: 'conv-1',
    message: 'hello',
    caller: tade,
  });
  assert.ok(body.includes('conversation_id'));
  assert.ok(body.includes('users prompt: hello'));
  assert.ok(body.includes('from the person that calls'));
  assert.ok(body.includes('Tade'));
  assert.strictEqual(wakeSubject('Tade Mehl'), '[AIRSUP] Tade Mehl');

  const both = await mcp.callTool('send_message', tade, {
    person_id: anna.person_id,
    conversation_id: 'nope',
    message: 'x',
  });
  assert.strictEqual(both.status, 'failed');

  console.log('mcp tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
