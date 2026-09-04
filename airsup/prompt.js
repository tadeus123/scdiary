const CHATGPT_SETUP_URL = 'https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a';
const { MCP_URL } = require('./config');

function generatePrompt({
  questions,
  answers,
  email,
  displayName,
  endpointId,
  mcpUrl,
  mcpToken,
}) {
  const profile = questions
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
    'Every Airsup tool call MUST include token plus this_endpoint (or requester_id on find_people). Never use another person’s ids.',
    '',
    'Gmail is only the doorbell. Send a new [A2A-RING] message. Never Gmail Reply. Never [A2A-REQUEST] or [A2A-RESPONSE]. Never answer a RING email.',
    'The conversation is session_sync. It waits up to 20 seconds. If must_call_again is true, call session_sync again immediately before talking to me. First since_seq=0, then always next_since_seq.',
    '',
    'Outgoing: find_people → show me → I approve → start_call → send the returned doorbell once → session_sync until hang_up.',
    'Incoming RING: handle_ring, then session_sync. If Gmail is late, list_calls.',
    'Do not invent people. Do not scrape a directory instead of find_people.',
    '',
    'Private profile (for you only; do not put intimate answers into find_people query):',
    '',
    profile,
    '',
    'First action now: list_calls to confirm the plugin works, then find_people with query taken only from help / dreams / who I want to meet — not sex, childhood, or birth date.',
    `Skip requester endpoint_id ${myEndpoint}.`,
  ].join('\n');
}

module.exports = {
  CHATGPT_SETUP_URL,
  MCP_URL,
  generatePrompt,
};
