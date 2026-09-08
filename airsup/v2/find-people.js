const { listingText, scorePerson, matchDescription } = require('./listing');

function personView(row) {
  if (!row) return null;
  const answers = (row.listing && row.listing.answers) || {};
  return {
    person_id: row.person_id,
    email: row.email || '',
    display_name: row.display_name || '',
    listing_text: listingText({
      answers,
      displayName: row.display_name,
      email: row.email,
    }),
  };
}

async function findPeople(store, { callerPersonId, query, maximumResults }) {
  const q = String(query || '').trim();
  const limit = Math.min(Math.max(Number(maximumResults) || 5, 1), 50);
  if (!q) return { matches: [] };
  const rows = (await store.listPeople())
    .map(personView)
    .filter((person) => person.person_id !== callerPersonId && String(person.email || '').trim());
  const scored = rows
    .map((person) => ({ person, score: scorePerson(person, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return {
    matches: scored.map(({ person }) => {
      const match = {
        person_id: person.person_id,
        name: person.display_name || person.email,
      };
      const description = matchDescription(person, q);
      if (description) match.description = description;
      return match;
    }),
  };
}

module.exports = {
  findPeople,
  personView,
};
