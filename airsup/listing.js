const { QUESTIONS } = require('./questions');
const { publicDisplayName } = require('./directory');

function listingText({ answers, displayName, email } = {}) {
  const name = publicDisplayName({ answers, displayName, email });
  const lines = [`Name: ${name}`];
  const source = answers && typeof answers === 'object' ? answers : {};
  for (const q of QUESTIONS) {
    const value = String(source[q.id] || '').trim();
    if (!value) continue;
    lines.push(`${q.text}: ${value}`);
  }
  return lines.join('\n');
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9äöüß]+/i)
    .filter((word) => word.length > 1);
}

function scorePerson(person, query) {
  const hay = `${person.display_name || ''} ${person.email || ''} ${person.listing_text || ''}`.toLowerCase();
  const needles = tokens(query);
  if (!needles.length) return 0;
  let hits = 0;
  for (const word of needles) {
    if (hay.includes(word)) hits += 1;
  }
  return hits;
}

function matchDescription(person, query) {
  const hay = String(person.listing_text || '');
  const q = String(query || '').trim();
  if (!hay) return undefined;
  const idx = hay.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0] || '');
  if (idx >= 0) {
    return hay.slice(Math.max(0, idx - 40), idx + 180).trim();
  }
  return hay.slice(0, 180);
}

module.exports = {
  listingText,
  tokens,
  scorePerson,
  matchDescription,
};
