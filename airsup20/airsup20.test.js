const assert = require('assert');
const { createMemoryStore } = require('./store-memory');
const { createMcp } = require('./mcp');
const { createServices } = require('./services');

async function run() {
  const store = createMemoryStore();
  const mcp = createMcp({
    store,
    fetchImpl: async () => {
      throw new Error('no network in tests');
    },
  });

  const tools = mcp.toolList().tools.map((t) => t.name);
  assert.deepStrictEqual(tools, ['me', 'setup', 'update_listing', 'fulfill', 'get_inbox', 'get_trace']);

  const alice = await store.upsertUser({
    googleId: 'g-alice',
    email: 'alice@example.com',
    displayName: 'Alice',
  });
  const bob = await store.upsertUser({
    googleId: 'g-bob',
    email: 'bob@example.com',
    displayName: 'Bob',
  });

  const services = createServices({
    store,
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });

  const before = await services.getMe(alice);
  assert.strictEqual(before.needs_setup, true);
  assert.ok(before.trace_id);
  assert.ok(Array.isArray(before.status_labels));

  const setup = await services.setup(alice, {
    answers: {
      who: 'Alice in Shenzhen',
      looking_for: 'someone to buy my chair',
      offer: 'old chair for 50-100 euros',
      contact: 'WeChat alice_sz',
    },
    context: 'User mentioned Shenzhen and selling furniture.',
  });
  assert.strictEqual(setup.ok, true);
  assert.strictEqual(setup.needs_setup, false);

  await services.updateListing(bob, {
    note: 'I want to buy a chair in Shenzhen',
    patch: {
      looking_for: 'chair in Shenzhen',
      contact: 'phone 123',
    },
    intents: [{ type: 'WANT', object: 'chair in Shenzhen' }],
  });
  // bob not onboarded — update should require setup
  assert.strictEqual((await services.getMe(bob)).needs_setup, true);
  await services.setup(bob, {
    answers: {
      who: 'Bob buyer',
      looking_for: 'chair in Shenzhen',
      offer: 'cash',
      contact: 'phone 123',
    },
  });
  await services.updateListing(bob, {
    patch: { offer: 'cash for chair', city: 'Shenzhen' },
    intents: [{ type: 'WANT', object: 'buy chair Shenzhen' }],
  });

  await store.upsertListing(alice.user_id, {
    body: {
      about: 'Alice in Shenzhen',
      offer: 'old wooden chair 50-100 euros',
      city: 'Shenzhen',
      contact: 'WeChat alice_sz',
      paypal: 'alice@paypal',
    },
    merge: true,
  });
  await store.insertIntent({
    user_id: alice.user_id,
    type: 'OFFER',
    object: 'chair for sale in Shenzhen',
    status: 'active',
    source: 'explicit',
  });

  const freshBob = await store.getUser(bob.user_id);
  const fulfilled = await services.fulfill(freshBob, {
    goal: 'Find me someone who sells a chair in Shenzhen',
    rounds: 1,
  });
  assert.strictEqual(fulfilled.ok, true);
  assert.ok(fulfilled.trace_id);
  assert.ok(fulfilled.answer);
  assert.ok(fulfilled.status_labels.includes('searching') || fulfilled.status_labels.some((s) => /search|probe|talk|answer/i.test(s)));
  assert.ok(Array.isArray(fulfilled.matches));
  assert.ok(fulfilled.matches.length >= 1);

  // Knowledge layer must be wired into endpoint context (not left empty forever).
  await store.insertFact({
    user_id: alice.user_id,
    statement: 'Alice can deliver the chair this week in Shenzhen',
    confidence: 0.9,
    source: 'explicit',
  });
  const prior = await store.listPriorBetweenUsers(freshBob.user_id, alice.user_id, { limit: 20 });
  assert.ok(prior.length >= 1);
  const aliceFacts = await store.listFacts(alice.user_id);
  assert.ok(aliceFacts.some((f) => /deliver the chair/i.test(f.statement)));

  const aliceInbox = await services.getInbox(await store.getUser(alice.user_id), { status: 'unread' });
  assert.ok(aliceInbox.count >= 1);

  const bundle = await services.getTrace(freshBob, { trace_id: fulfilled.trace_id });
  assert.strictEqual(bundle.ok, true);
  assert.ok(bundle.spans.length >= 2);
  assert.ok(bundle.trace.duration_ms != null);
  for (const span of bundle.spans) {
    assert.ok(span.duration_ms != null, `span ${span.name} missing duration`);
  }

  // MCP tool call path
  const listed = await mcp.callTool('me', await store.getUser(alice.user_id), {});
  assert.strictEqual(listed.needs_setup, false);

  console.log('airsup20 tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
