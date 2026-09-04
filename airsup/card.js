const { QUESTIONS } = require('./questions');
const { clip, publicDisplayName } = require('./directory');
const { isOpenAiConfigured, chatJson } = require('./openai');

const CARD_SOURCE_IDS = [
  'help_others',
  'dreams',
  'person_to_meet',
  'book_recommend',
  'spread_universe',
  'alone_universe',
];

function asList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clip(item, 120)).filter(Boolean).slice(0, 8);
  }
  return String(value || '')
    .split(/\n|,/)
    .map((item) => clip(item, 120))
    .filter(Boolean)
    .slice(0, 8);
}

function emptyCard() {
  return {
    can_help_with: [],
    wants_help_with: [],
    people_they_want_to_meet: [],
    interests: [],
    short_context: '',
  };
}

function normalizeCard(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    can_help_with: asList(source.can_help_with),
    wants_help_with: asList(source.wants_help_with),
    people_they_want_to_meet: asList(source.people_they_want_to_meet),
    interests: asList(source.interests),
    short_context: clip(source.short_context, 280),
  };
}

function safeAnswersForCard(answers) {
  const source = answers && typeof answers === 'object' ? answers : {};
  const safe = {};
  for (const q of QUESTIONS) {
    if (!CARD_SOURCE_IDS.includes(q.id)) continue;
    const value = clip(source[q.id], 400);
    if (value) safe[q.text] = value;
  }
  return safe;
}

function fallbackCard(answers) {
  const source = answers && typeof answers === 'object' ? answers : {};
  return normalizeCard({
    can_help_with: source.help_others,
    wants_help_with: source.dreams,
    people_they_want_to_meet: source.person_to_meet,
    interests: [source.book_recommend, source.spread_universe].filter(Boolean),
    short_context: clip(source.dreams || source.help_others, 280),
  });
}

async function generateMatchCard(answers) {
  const safe = safeAnswersForCard(answers);
  if (!Object.keys(safe).length) return fallbackCard(answers);
  if (!isOpenAiConfigured()) return fallbackCard(answers);

  const generated = await chatJson(
    'Create a compact public match card from these answers. Return JSON only. Never include sexual, romantic, family trauma, or other intimate details. Use short concrete phrases. Arrays of 1 to 5 items.',
    JSON.stringify({
      answers: safe,
      format: emptyCard(),
    })
  );
  return normalizeCard(generated);
}

function compactDirectoryCard(row) {
  if (!row || !row.active || !row.contactable || !row.card_approved) return null;
  const card = normalizeCard(row.match_card);
  return {
    endpoint_id: row.endpoint_id,
    name: publicDisplayName({
      answers: row.answers,
      displayName: row.display_name,
      email: row.endpoint_email,
    }),
    ai_endpoint_email: row.endpoint_email,
    can_help_with: card.can_help_with,
    wants_help_with: card.wants_help_with,
    people_they_want_to_meet: card.people_they_want_to_meet,
    interests: card.interests,
    short_context: card.short_context,
    contact_enabled: true,
  };
}

function publicDirectory(rows) {
  return (rows || []).map(compactDirectoryCard).filter(Boolean);
}

function linesFromList(list) {
  return asList(list).join('\n');
}

module.exports = {
  CARD_SOURCE_IDS,
  emptyCard,
  normalizeCard,
  safeAnswersForCard,
  fallbackCard,
  generateMatchCard,
  compactDirectoryCard,
  publicDirectory,
  linesFromList,
  asList,
};
