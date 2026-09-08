const assert = require('assert');
const { createMemoryStore, sha256, randomToken } = require('./store-memory');
const { createMcp, toolList } = require('./mcp');
const { WIDGET_URI, widgetResource, widgetContents } = require('./widget');
const { THREADS_URI } = require('./panel');
const { wakeBody, wakeSubject } = require('./mail');

(async () => {
  const names = toolList().tools.map((tool) => tool.name);
  assert.deepStrictEqual(names, ['find_people', 'send_message', 'end_conversation']);
  assert.ok(toolList().tools[1].description.includes('Provide exactly one of person_id or conversation_id'));
  assert.ok(toolList().tools[2].description.includes('Do not use this merely because you are temporarily waiting'));
  assert.strictEqual(toolList().tools[0]._meta, undefined);
  assert.strictEqual(toolList().tools[1]._meta['openai/outputTemplate'], WIDGET_URI);
  assert.strictEqual(toolList().tools[2]._meta['openai/outputTemplate'], WIDGET_URI);

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
  assert.deepStrictEqual(Object.keys(both).sort(), ['conversation_id', 'reply', 'status']);
  assert.strictEqual(widgetResource().uri, WIDGET_URI);
  assert.strictEqual(widgetResource()._meta['openai/widgetDomain'], 'https://www-tademehl-com.oaiusercontent.com');
  assert.strictEqual(widgetContents(WIDGET_URI).contents[0]._meta['openai/widgetDomain'], 'https://www-tademehl-com.oaiusercontent.com');
  assert.ok(Array.isArray(widgetContents(WIDGET_URI).contents[0]._meta.ui.csp.connectDomains));
  assert.ok(widgetContents(WIDGET_URI).contents[0].text.includes('Airsup'));
  assert.ok(widgetContents(WIDGET_URI).contents[0].text.includes('Waiting for the other Airsup AI'));
  assert.ok(widgetContents(WIDGET_URI).contents[0].text.includes('End conversation'));
  assert.ok(widgetContents(WIDGET_URI).contents[0].text.includes('send_message'));
  assert.ok(widgetContents(WIDGET_URI).contents[0].text.includes('end_conversation'));
  assert.deepStrictEqual(widgetContents('ui://other').contents, []);

  function fakeReq(body, token) {
    return {
      method: 'POST',
      body,
      headers: token ? { authorization: 'Bearer ' + token } : {},
      get(name) {
        if (String(name).toLowerCase() === 'authorization') return this.headers.authorization;
        return '';
      },
    };
  }
  function fakeRes() {
    return {
      statusCode: 200,
      body: null,
      set() { return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      end() { return this; },
    };
  }

  const denied = fakeRes();
  await mcp.handleMcp(fakeReq({ jsonrpc: '2.0', id: 7, method: 'resources/read', params: { uri: THREADS_URI } }), denied);
  assert.strictEqual(denied.statusCode, 401);

  const listed = fakeRes();
  await mcp.handleMcp(fakeReq({ jsonrpc: '2.0', id: 8, method: 'resources/list' }, access), listed);
  assert.ok(listed.body.result.resources.some((row) => row.uri === THREADS_URI));

  const tadeRes = fakeRes();
  const tadeSend = mcp.handleMcp(fakeReq({
    jsonrpc: '2.0',
    id: 9,
    method: 'tools/call',
    params: { name: 'send_message', arguments: { person_id: anna.person_id, message: 'hello anna' } },
  }, access), tadeRes);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const convs = await store.listConversationsForPerson(tade.person_id);
  const conversationId = convs[0].conversation_id;
  const annaWait = mcp.callTool('send_message', anna, { conversation_id: conversationId, message: 'hello tade' });
  await tadeSend;
  const payload = tadeRes.body.result;
  assert.strictEqual(payload.structuredContent.status, 'replied');
  assert.deepStrictEqual(Object.keys(payload.structuredContent).sort(), ['conversation_id', 'reply', 'status']);
  assert.strictEqual(payload._meta.ui.panel.other.name, 'Anna Schmidt');
  assert.strictEqual(payload._meta.ui.panel.messages[0].body, 'hello anna');
  assert.strictEqual(payload._meta.ui.panel.messages[1].body, 'hello tade');

  const endedRes = fakeRes();
  await mcp.handleMcp(fakeReq({
    jsonrpc: '2.0',
    id: 10,
    method: 'tools/call',
    params: { name: 'end_conversation', arguments: { conversation_id: conversationId } },
  }, access), endedRes);
  const annaEnded = await annaWait;
  assert.strictEqual(annaEnded.status, 'ended');
  assert.strictEqual(endedRes.body.result.structuredContent.status, 'ended');
  assert.ok(!Object.prototype.hasOwnProperty.call(endedRes.body.result.structuredContent, 'reply'));

  console.log('mcp tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
