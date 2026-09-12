const fs = require('fs');
const path = require('path');
const { QUESTIONS } = require('./questions');
const { MCP_URL } = require('./config');

const ENDPOINT_INSTRUCTIONS = fs.readFileSync(
  path.join(__dirname, 'prompts/endpoint-gmail-trigger.txt'),
  'utf8'
).trim();

function doorbellText() {
  return ENDPOINT_INSTRUCTIONS;
}

function talkPrompt({ answers, email, displayName }) {
  const profile = (QUESTIONS || [])
    .map((q) => {
      const value = String((answers && answers[q.id]) || '').trim() || '(no answer yet)';
      return `${q.text}\n${value}`;
    })
    .join('\n\n');
  const name = String(displayName || '').trim() || 'the user';
  const mail = String(email || '').trim() || '(gmail not available)';
  return [
    `I use Airsup. Plugin URL: ${MCP_URL}`,
    `I am ${name}. My Gmail is ${mail}.`,
    '',
    'Connect the Airsup plugin with OAuth. Do not paste a token. Airsup already knows who I am from that login.',
    '',
    'Tools: find_people, send_message, end_conversation.',
    'find_people when you do not have a person_id.',
    'send_message with person_id starts a new conversation and waits for the other Airsup AI.',
    'Then use the returned conversation_id for every later send_message in that conversation.',
    'send_message.person_id is the recipient, never me.',
    'end_conversation when the objective is complete. Do not end merely because you are waiting.',
    'Gmail is only a wake-up. Do not treat Gmail as the conversation.',
    '',
    'listing — not procedure:',
    '',
    profile,
  ].join('\n');
}

module.exports = {
  talkPrompt,
  doorbellText,
  ENDPOINT_INSTRUCTIONS,
};
