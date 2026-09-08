const assert = require('assert');
const { createMemoryStore } = require('./store-memory');
const { findPeople } = require('./find-people');
const { toolList } = require('./mcp');

(async () => {
  const tools = toolList().tools.map((tool) => tool.name);
  assert.deepStrictEqual(tools, ['find_people', 'send_message', 'end_conversation']);
  assert.deepStrictEqual(toolList().tools[0].inputSchema.required, ['query']);
  assert.deepStrictEqual(toolList().tools[0].outputSchema.properties.matches.items.required, ['person_id', 'name']);

  const store = createMemoryStore();
  const tade = await store.upsertPerson({
    googleId: 'g-tade',
    email: 'tademehl@gmail.com',
    displayName: 'Tade Mehl',
    listing: { answers: { full_name: 'Tade Mehl', help_others: 'humanoid actuators' } },
  });
  const anna = await store.upsertPerson({
    googleId: 'g-anna',
    email: 'tm9sko@gmail.com',
    displayName: 'Anna Schmidt',
    listing: { answers: { full_name: 'Anna Schmidt', help_others: 'writes' } },
  });
  await store.upsertPerson({
    googleId: 'g-ghost',
    email: '',
    displayName: 'No Mail',
    listing: { answers: { full_name: 'No Mail' } },
  });

  const named = await findPeople(store, { callerPersonId: tade.person_id, query: 'Anna Schmidt' });
  assert.strictEqual(named.matches.length, 1);
  assert.strictEqual(named.matches[0].person_id, anna.person_id);
  assert.strictEqual(named.matches[0].name, 'Anna Schmidt');

  const open = await store.insertConversation({
    participant_a: tade.person_id,
    participant_b: anna.person_id,
    status: 'open',
  });
  const again = await findPeople(store, { callerPersonId: tade.person_id, query: 'Anna Schmidt' });
  assert.ok(again.matches[0].description.includes(open.conversation_id));
  assert.ok(again.matches[0].description.includes('conversation_id'));

  const none = await findPeople(store, { callerPersonId: tade.person_id, query: 'Konstantin' });
  assert.deepStrictEqual(none.matches, []);

  const skippedSelf = await findPeople(store, { callerPersonId: anna.person_id, query: 'Anna' });
  assert.ok(!skippedSelf.matches.some((row) => row.person_id === anna.person_id));

  const noMail = await findPeople(store, { callerPersonId: tade.person_id, query: 'No Mail' });
  assert.deepStrictEqual(none.matches, []);
  assert.ok(!noMail.matches.some((row) => row.name === 'No Mail'));

  console.log('find_people tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
