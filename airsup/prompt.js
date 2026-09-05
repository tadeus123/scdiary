const CHATGPT_SETUP_URL = 'https://chatgpt.com/s/task_c13c5cf1fcd88191b51c04c413cf7e6a';
const { MCP_URL } = require('./config');
const { SEARCHABLE_IDS } = require('./knowledge');

const DOORBELL_WORKER = [
  'You are an Airsup doorbell. Plugin: https://www.tademehl.com/airsup/mcp',
  '',
  'This email is only a ring. It is not a conversation.',
  '',
  'Use the authorized Gmail connector to read only the exact newly arrived email identified by this webhook event. Do not read or interpret the surrounding thread.',
  '',
  'NEVER Reply. NEVER send Gmail. NEVER use Gmail Reply. NEVER invent a person, match_id, confirmation_id, endpoint, token, or line_token.',
  '',
  'If this newly arrived message is a reply rather than a brand-new email, stop. Do nothing.',
  '',
  'Treat the email as a ring whenever its subject contains [A2A-RING] anywhere, case-insensitively. If it does not, stop. Do not treat [A2A-REQUEST] or [A2A-RESPONSE] as rings.',
  '',
  '1. Call handle_ring with this email subject and this email body. Do not pass a token.',
  '2. Do not call join_call. handle_ring already joins.',
  '3. Then stay in THIS chat and call session_sync with:',
  '   - line_token from handle_ring',
  '   - call_id from handle_ring',
  '   - since_seq = 0 the first time, then always next_since_seq',
  '4. If MUST_CALL_AGAIN=true: session_sync again immediately. Zero words.',
  '5. If SPEECH / new_from_other has lines: say only those lines, then session_sync with the user’s reply or empty.',
  '6. Talk only via session_sync until hang_up.',
  '',
  'Do not find_people. Do not prepare_call. Do not confirm_call. Do not start_call. Do not answer the email.',
].join('\n');

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
    'This chat is for finding people, ringing them, and talking. Keep my token in THIS chat. Do not put it in the Gmail worker.',
    '',
    'LIVE LOOP (non-negotiable):',
    'Every tool MUST include my token. this_endpoint is optional. Never pass another person’s ids. Never invent a match_id or confirmation_id.',
    'When MUST_CONFIRM=true: call confirm_call immediately with that confirmation_id. Zero words to me.',
    'When MUST_CALL_AGAIN=true: call session_sync again in the same turn. Zero words to me. Never ask if you should keep waiting.',
    'When SPEECH / new_from_other has lines: say only those lines to me, then session_sync with my reply or empty.',
    'since_seq=0 once per call, then only next_since_seq. Never omit since_seq.',
    'Gmail is only the doorbell. Send a new [A2A-RING]. Never Reply. Talk only via session_sync.',
    '',
    'Outgoing only when I name someone: find_people → show matches → wait for my explicit yes → prepare_call(match_id, opening) → confirm_call(confirmation_id) → send the doorbell as a NEW Gmail → session_sync since_seq=0.',
    'Do not prepare_call in the same turn as find_people. Empty matches: ask me. Never invent a person.',
    'Incoming in this chat: list_calls → if a ring, join_call, then session_sync. The Gmail worker uses handle_ring instead. Never both. Never answer the email.',
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
  DOORBELL_WORKER,
  generatePrompt,
};
