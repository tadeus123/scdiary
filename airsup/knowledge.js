const { QUESTIONS } = require('./questions');
const { clip, publicDisplayName } = require('./directory');

/** Never embed or list these. Sex, childhood, crying, and birth date stay private. */
const PRIVATE_IDS = new Set([
  'geburtsdatum',
  'grew_up',
  'last_cry',
  'sex_like',
  'sex_frequency',
  'sex_life',
]);

const SEARCHABLE_IDS = QUESTIONS.map((q) => q.id).filter((id) => !PRIVATE_IDS.has(id));

function publicAnswers(answers) {
  const source = answers && typeof answers === 'object' ? answers : {};
  const out = {};
  for (const q of QUESTIONS) {
    if (PRIVATE_IDS.has(q.id)) continue;
    const value = clip(source[q.id], 800);
    if (value) out[q.id] = value;
  }
  return out;
}

function knowledgeDocument(row) {
  const answers = publicAnswers(row && row.answers);
  const name = publicDisplayName({
    answers: row && row.answers,
    displayName: row && row.display_name,
    email: row && row.endpoint_email,
  });
  const lines = [`Name: ${name}`];
  if (row && row.endpoint_email) lines.push(`Email: ${row.endpoint_email}`);
  for (const q of QUESTIONS) {
    if (!answers[q.id]) continue;
    lines.push(`${q.text}: ${answers[q.id]}`);
  }
  return lines.join('\n');
}

function publicPerson(row) {
  if (!row || !row.active || !row.contactable) return null;
  const answers = publicAnswers(row.answers);
  const knowledge = {};
  for (const q of QUESTIONS) {
    if (!answers[q.id]) continue;
    knowledge[q.text] = answers[q.id];
  }
  return {
    endpoint_id: row.endpoint_id,
    name: publicDisplayName({
      answers: row.answers,
      displayName: row.display_name,
      email: row.endpoint_email,
    }),
    ai_endpoint_email: row.endpoint_email,
    knowledge,
    contact_enabled: true,
  };
}

function publicDirectory(rows) {
  return (rows || []).map(publicPerson).filter(Boolean);
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter((word) => word.length > 1);
}

function nameMatchScore(row, query) {
  const hay = `${publicDisplayName({
    answers: row && row.answers,
    displayName: row && row.display_name,
    email: row && row.endpoint_email,
  })} ${(row && row.endpoint_email) || ''}`.toLowerCase();
  const needles = tokens(query);
  if (!needles.length) return 0;
  let hits = 0;
  for (const word of needles) {
    if (word.length < 3) continue;
    if (hay.includes(word)) hits += 1;
  }
  return hits;
}

function keywordScore(document, query) {
  const hay = new Set(tokens(document));
  const needles = tokens(query);
  if (!needles.length || !hay.size) return 0;
  let hits = 0;
  for (const word of needles) {
    if (hay.has(word)) hits += 1;
  }
  return hits / needles.length;
}

module.exports = {
  PRIVATE_IDS,
  SEARCHABLE_IDS,
  publicAnswers,
  knowledgeDocument,
  publicPerson,
  publicDirectory,
  nameMatchScore,
  keywordScore,
};
