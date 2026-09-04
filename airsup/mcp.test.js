const assert = require('assert');
const { toolList, formatToolResult, callTool } = require('./mcp');

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

  console.log('mcp tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
