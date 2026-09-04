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
    'Save endpoint_id, token, MCP URL, and these call rules.',
    'Every Airsup tool MUST include token plus this_endpoint (or requester_id on find_people). Never use another person’s ids.',
    '',
    'Gmail is only the doorbell. Send a new [A2A-RING] message. Never Reply. Never answer a RING email. Talk only via session_sync.',
    '',
    'session_sync waits up to 12 seconds.',
    'If new_from_other has lines: say those lines to me, then session_sync again with my reply (or empty) and since_seq=next_since_seq.',
    'If MUST_CALL_AGAIN is true and new_from_other is empty: call session_sync again immediately. Do not ask me. Do not narrate waiting.',
    'First since_seq=0, then always next_since_seq. Never omit since_seq.',
    '',
    'Outgoing: find_people → show me → I approve → start_call → send the returned doorbell once → session_sync until hang_up.',
    'Incoming RING email: handle_ring, then session_sync. If Gmail is late, list_calls then join_call.',
    'If find_people returns no matches, ask me. Never invent a person or endpoint_id. Do not scrape a directory.',
    '',
    'Public profile (search with this; never search with sex, childhood, crying, or birth date):',
    '',
    profile,
    '',
    'First action now: list_calls to confirm the plugin works, then find_people with query taken only from help / dreams / who I want to meet.',
    `Skip requester endpoint_id ${myEndpoint}.`,
  ].join('\n');
}

module.exports = {
  CHATGPT_SETUP_URL,
  MCP_URL,
  generatePrompt,
};
