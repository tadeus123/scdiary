const assert = require('assert');
const { classifyMessage, parseEnvelope } = require('./a2a');
const { toolList } = require('./mcp');

function envelope(type) {
  return parseEnvelope([
    'A2A-PROTOCOL: 1',
    `MESSAGE-TYPE: ${type}`,
    'MESSAGE-ID: msg_1',
    'REQUEST-ID: req_1',
    'CONVERSATION-ID: conv_1',
    'FROM-ENDPOINT: endpoint_a',
    'TO-ENDPOINT: endpoint_b',
    'IN-REPLY-TO: none',
    `RESPONSE-EXPECTED: ${type === 'RESPONSE' ? 'NO' : 'YES'}`,
    '',
    type === 'RESPONSE' ? 'Here is the answer.' : 'Who can help?',
  ].join('\n'));
}

assert.strictEqual(
  classifyMessage({ subject: '[A2A-REQUEST] req_1', envelope: envelope('REQUEST') }),
  'REQUEST'
);

assert.strictEqual(
  classifyMessage({ subject: '[A2A-RESPONSE] req_1', envelope: envelope('RESPONSE') }),
  'RESPONSE'
);

assert.strictEqual(
  classifyMessage({
    subject: '[A2A-RESPONSE] req_1',
    envelope: envelope('REQUEST'),
  }),
  'RESPONSE',
  'subject RESPONSE must win over a lying REQUEST envelope'
);

assert.strictEqual(
  classifyMessage({
    subject: '[A2A-REQUEST] req_1',
    envelope: envelope('RESPONSE'),
  }),
  'RESPONSE',
  'Gmail Reply that kept the request subject must still be a RESPONSE'
);

assert.strictEqual(
  classifyMessage({ subject: 'hello', envelope: envelope('RESPONSE') }),
  'RESPONSE'
);

assert.strictEqual(
  classifyMessage({ subject: 'lunch?', envelope: { messageType: '' } }),
  null
);

assert.strictEqual(
  classifyMessage({ subject: '[A2A-RING] call_1', envelope: { messageType: 'RING' } }),
  'RING'
);

assert.strictEqual(
  classifyMessage({ subject: '[A2A-RING] call_1', envelope: envelope('REQUEST') }),
  'RING',
  'doorbell must never be classified as a REQUEST'
);

console.log('a2a classify tests passed');

const names = toolList().tools.map((tool) => tool.name);
assert.deepStrictEqual(names, [
  'find_people',
  'start_call',
  'join_call',
  'session_sync',
  'hang_up',
  'list_calls',
  'handle_ring',
]);
assert.ok(toolList().tools.every((tool) => tool.inputSchema.properties.token));
const session = toolList().tools.find((tool) => tool.name === 'session_sync');
assert.ok(session.inputSchema.required.includes('since_seq'));
console.log('mcp tool list tests passed');
