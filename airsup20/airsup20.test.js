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
  const dbMod = require('./db');
  assert.ok(dbMod.airsup20SupabaseUrl().includes('wttyutffpgazxgwjzyuw'));

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

  // Pictures: ChatGPT file objects, path alias, append, and first-shot confirmation.
  const updateTool = mcp.toolList().tools.find((t) => t.name === 'update_listing');
  const setupTool = mcp.toolList().tools.find((t) => t.name === 'setup');
  assert.deepStrictEqual(updateTool._meta['openai/fileParams'], ['media']);
  assert.deepStrictEqual(setupTool._meta['openai/fileParams'], ['media']);
  assert.ok(/you can upload pictures/i.test(updateTool.description));
  assert.ok(updateTool.inputSchema.properties.media.items.properties.download_url);
  assert.ok(updateTool.inputSchema.properties.media.items.properties.path);

  const freshAlice = await store.getUser(alice.user_id);
  const withPath = await services.updateListing(freshAlice, {
    note: 'Blackbird shampoo $24 USD',
    patch: { offer: 'Blackbird shampoo $24 USD' },
    media: [{ path: '/mnt/data/blackbird.jpg', caption: 'Blackbird' }],
  });
  assert.strictEqual(withPath.ok, true);
  assert.strictEqual(withPath.media_added, 1);
  assert.strictEqual(withPath.listing.media[0].url, '/mnt/data/blackbird.jpg');
  assert.strictEqual(withPath.listing.media[0].caption, 'Blackbird');
  assert.ok(!Object.prototype.hasOwnProperty.call(withPath.listing.media[0], 'path'));

  const withFileObject = await services.updateListing(freshAlice, {
    patch: { offer: 'Blackbird shampoo $24 USD' },
    media: [{
      download_url: 'https://files.example/blackbird.png',
      file_id: 'file_blackbird',
      mime_type: 'image/png',
      file_name: 'blackbird.png',
      caption: 'Blackbird bottle',
    }],
  });
  assert.strictEqual(withFileObject.media_count, 2);
  assert.ok(withFileObject.listing.media.some((m) => m.file_id === 'file_blackbird'));
  assert.ok(withFileObject.listing.media.some((m) => m.url === '/mnt/data/blackbird.jpg'));

  const mediaResult = mcp.formatToolResult(withFileObject);
  assert.ok(/Pictures added this call: 1/.test(mediaResult.content[0].text));

  const badMedia = await services.updateListing(freshAlice, {
    patch: { offer: 'Blackbird shampoo $24 USD' },
    media: [{ caption: 'no file' }],
  });
  assert.strictEqual(badMedia.ok, true);
  assert.ok(badMedia.media_error);
  assert.ok(/never in a path field/i.test(badMedia.media_error));
  assert.strictEqual(badMedia.media_count, 2);

  const listed = await mcp.callTool('me', await store.getUser(alice.user_id), {});
  assert.strictEqual(listed.needs_setup, false);

  process.env.AIRSUP20_DEMO_USERNAME = 'airsup-reviewer';
  process.env.AIRSUP20_DEMO_PASSWORD = 'test-demo-password';
  const auth = require('./auth');
  assert.strictEqual(auth.isDemoLoginEnabled(), true);
  assert.strictEqual(auth.verifyDemoCredentials('airsup-reviewer', 'test-demo-password'), true);
  assert.strictEqual(auth.verifyDemoCredentials('wrong', 'test-demo-password'), false);
  assert.strictEqual(auth.verifyDemoCredentials('airsup-reviewer', 'wrong'), false);
  assert.strictEqual(auth.demoUserProfile().googleId, 'airsup20-demo-reviewer');

  console.log('airsup20 tests ok');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
