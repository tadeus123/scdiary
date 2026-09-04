/**
 * Isolated OpenAI helper for Airsup. Do not import server/services.
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.AIRSUP_MATCH_MODEL || 'gpt-4o-mini';

function isOpenAiConfigured() {
  return Boolean(OPENAI_API_KEY);
}

async function chatJson(system, user, { temperature = 0.2, maxTokens = 1200 } = {}) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error && data.error.message ? data.error.message : 'OpenAI request failed');
  }
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('OpenAI returned an empty response');
  return JSON.parse(text);
}

module.exports = {
  MODEL,
  isOpenAiConfigured,
  chatJson,
};
