const CHATGPT_SETUP_URL = 'https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a';
const { MCP_URL } = require('./config');
const { SEARCHABLE_IDS } = require('./knowledge');

function generatePrompt({
  questions,
  answers,
  email,
  displayName,
  endpointId,
  mcpUrl,
  mcpToken,
}) {
  const profile = (questions || [])
    .filter((q) => SEARCHABLE_IDS.includes(q.id))
    .map((q) => {
      const value = String(answers[q.id] || '').trim() || '(no answer yet)';
      return `${q.text}\n${value}`;
    })
    .join('\n\n');

  const mail = String(email || '').trim() || '(gmail not available)';
  const name = String(displayName || '').trim() || 'the user';
  const myEndpoint = String(endpointId || '').trim() || '(not registered yet)';
  const mcp = String(mcpUrl || '').trim() || MCP_URL;
  const token = String(mcpToken || '').trim() || '(finish onboarding to get a token)';

  return [
    `I use Airsup. Plugin URL: ${mcp}`,
    `My endpoint_id: ${myEndpoint}`,
    `My token: ${token}`,
    `My Gmail (doorbell only): ${mail}`,
    `I am ${name}.`,
    '',
    'LIVE LOOP (non-negotiable):',
    'Every tool MUST include token plus this_endpoint (requester_id on find_people). Never use another person’s ids.',
    'When MUST_CALL_AGAIN=true: call session_sync again in the same turn. Zero words to me. Never ask if you should keep waiting.',
    'When SPEECH / new_from_other has lines: say only those lines to me, then session_sync with my reply or empty.',
    'since_seq=0 once per call, then only next_since_seq. Never omit since_seq.',
    'Gmail is only the doorbell. Send a new [A2A-RING]. Never Reply. Talk only via session_sync.',
    '',
    'Outgoing only when I name someone: find_people → show matches → wait for my explicit yes → start_call → send the doorbell as a NEW Gmail → session_sync since_seq=0.',
    'Do not start_call in the same turn as find_people. Empty matches: ask me. Never invent a person or endpoint_id.',
    'RING email → handle_ring (that joins). list_calls shows a ring → join_call with that call_id. Never both. Never answer the email. Then session_sync.',
    '',
    'First action now: list_calls to confirm the plugin works. Then STOP. No tools until I say a name or a RING arrives.',
    `Skip requester endpoint_id ${myEndpoint}.`,
    '',
    'listing — not call procedure:',
    '',
    profile,
  ].join('\n');
}

module.exports = {
  CHATGPT_SETUP_URL,
  MCP_URL,
  generatePrompt,
};
