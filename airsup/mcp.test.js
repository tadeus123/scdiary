const assert = require('assert');
const { toolList, formatToolResult, callTool, withAuth } = require('./mcp');

const session = toolList().tools.find((tool) => tool.name === 'session_sync');
assert.ok(session.inputSchema.required.includes('since_seq'));

(async () => {
  const ignored = await callTool('create_network_request', {
    token: 'x',
    this_endpoint: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    request: 'old a2a',
  });
  assert.strictEqual(ignored.ok, false);
  assert.strictEqual(ignored.action, 'ignore');

  assert.deepStrictEqual(
    withAuth({ query: 'Anna' }, 'header-token'),
    { query: 'Anna', token: 'header-token' }
  );
  assert.deepStrictEqual(
    withAuth({ token: 'arg-token', query: 'Anna' }, 'header-token'),
    { token: 'arg-token', query: 'Anna' }
  );

  try {
    await callTool('prepare_call', {
      token: 'tok_abcdefghijklmnopqrstuv',
      match_id: 'm.nope.sig',
      target_endpoint: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    assert.fail('target_endpoint must be rejected');
  } catch (error) {
    assert.ok(/match_id/.test(error.message));
  }

  const banner = formatToolResult({
    must_call_again: false,
    next_since_seq: 4,
    new_from_other: [{ body: 'hello from anna' }],
    instruction: 'Relay ONLY new_from_other to the user now.',
  });
  const text = banner.content[0].text;
  assert.ok(text.startsWith('MUST_CALL_AGAIN=false next_since_seq=4 new_from_other=1'));
  assert.ok(text.includes('SPEECH:'));
  assert.ok(text.includes('hello from anna'));

  const empty = formatToolResult({
    must_call_again: true,
    next_since_seq: 4,
    new_from_other: [],
    instruction: 'No new speech.',
  });
  assert.ok(empty.content[0].text.startsWith('MUST_CALL_AGAIN=true'));
  assert.ok(!empty.content[0].text.includes('SPEECH:'));

  const confirmBanner = formatToolResult({
    must_confirm: true,
    confirmation_id: 'c.test.sig',
    instruction: 'Call confirm_call now with this confirmation_id. Zero words to the user.',
  });
  assert.ok(confirmBanner.content[0].text.startsWith('MUST_CONFIRM=true confirmation_id=c.test.sig'));

  console.log('mcp tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
