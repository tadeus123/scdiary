const { listingText, scorePerson, matchDescription } = require('./listing');
const { latestOpenWith } = require('./conversations');

function personView(row) {
  if (!row) return null;
  const listing = row.listing && typeof row.listing === 'object' ? row.listing : {};
  const answers = listing.answers || {};
  return {
    person_id: row.person_id,
    email: row.email || '',
    display_name: row.display_name || '',
    contactable: listing.contactable !== false,
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
    .filter((person) => person.person_id !== callerPersonId && String(person.email || '').trim() && person.contactable);
  const scored = rows
    .map((person) => ({ person, score: scorePerson(person, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return {
    matches: await Promise.all(scored.map(async ({ person }) => {
      const match = {
        person_id: person.person_id,
        name: person.display_name || person.email,
      };
      const open = await latestOpenWith(store, callerPersonId, person.person_id);
      const bits = [];
      if (open) {
        bits.push(
          `Open conversation_id ${open.conversation_id}. Continue with send_message(conversation_id), not person_id, unless the user wants a new thread.`
        );
      }
      const description = matchDescription(person, q);
      if (description) bits.push(description);
      if (bits.length) match.description = bits.join(' ');
      return match;
    })),
  };
}

module.exports = {
  findPeople,
  personView,
};
