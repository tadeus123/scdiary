const { chatJson, isOpenAiConfigured } = require('./openai');
const { compactDirectoryCard } = require('./card');

const SCORING = `
Score complementarity, not similarity.
Weights:
- Can concretely help with the need: 40%
- Requester can provide reciprocal value: 25%
- Matches desired type of person: 20%
- Shared context makes interaction productive: 10%
- Evidence confidence: 5%
Do not pick someone only because they are similar.
Never invent people. Only use the given cards.
Never use intimate or sexual information. There is none in these cards.
If nobody fits, return an empty matches array.
`;

async function findPeople({
  requesterId,
  currentNeed,
  whatRequesterCanOffer,
  desiredPerson,
  maximumResults = 3,
  rows,
}) {
  const exclude = String(requesterId || '').trim();
  const cards = (rows || [])
    .map(compactDirectoryCard)
    .filter(Boolean)
    .filter((card) => card.endpoint_id !== exclude);

  const limit = Math.min(Math.max(Number(maximumResults) || 3, 1), 5);

  if (!cards.length) {
    return { matches: [], note: 'No other active, contactable, approved cards yet.' };
  }

  if (!isOpenAiConfigured()) {
    throw new Error('Matching model is not configured. Set OPENAI_API_KEY.');
  }

  const result = await chatJson(
    `You match people in a small AI-to-AI network of about 20 users. ${SCORING}
Return JSON: { "matches": [ { "endpoint_id", "name", "score", "fit_reason", "relevant_capabilities", "relevant_need", "ai_endpoint_email" } ] }
score is 0-100. Return at most ${limit} matches, best first.`,
    JSON.stringify({
      request: {
        requester_id: exclude,
        current_need: currentNeed || '',
        what_requester_can_offer: whatRequesterCanOffer || '',
        desired_person: desiredPerson || '',
      },
      cards,
    }),
    { maxTokens: 1600 }
  );

  const allowed = new Map(cards.map((card) => [card.endpoint_id, card]));
  const matches = Array.isArray(result.matches) ? result.matches : [];
  return {
    matches: matches
      .map((item) => {
        const card = allowed.get(String(item.endpoint_id || ''));
        if (!card) return null;
        return {
          endpoint_id: card.endpoint_id,
          name: card.name,
          score: Math.max(0, Math.min(100, Number(item.score) || 0)),
          fit_reason: String(item.fit_reason || '').slice(0, 400),
          relevant_capabilities: Array.isArray(item.relevant_capabilities)
            ? item.relevant_capabilities.map((value) => String(value).slice(0, 80)).slice(0, 6)
            : card.can_help_with,
          relevant_need: String(item.relevant_need || card.wants_help_with[0] || '').slice(0, 160),
          ai_endpoint_email: card.ai_endpoint_email,
        };
      })
      .filter(Boolean)
      .slice(0, limit),
  };
}

module.exports = { findPeople };
