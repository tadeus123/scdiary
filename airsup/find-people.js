const { listingText, scorePerson, matchDescription } = require('./listing');
const { publicDisplayName } = require('./directory');

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
    name: publicDisplayName({
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
  const matches = scored.map(({ person }) => {
    const match = {
      person_id: person.person_id,
      name: person.name || person.display_name || person.email,
    };
    const description = matchDescription(person, q);
    if (description) match.description = description;
    return match;
  });
  // AIRSUP-CHINA-BEGIN
  try {
    const chinaFind = require('./china/find');
    const extra = await chinaFind.findForPlugin({
      query: q,
      limit,
      excludeIds: [callerPersonId, ...matches.map((row) => row.person_id)],
    });
    const companies = (extra || []).map((row) => ({
      person_id: row.person_id,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
    }));
    return { matches: mergeMatches(matches, companies, limit) };
  } catch (error) {
    console.error('Airsup china find skipped:', error.message);
  }
  // AIRSUP-CHINA-END
  return { matches };
}

function mergeMatches(peopleMatches, companyMatches, limit) {
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 50);
  const people = Array.isArray(peopleMatches) ? peopleMatches : [];
  const extra = Array.isArray(companyMatches) ? companyMatches : [];
  if (!extra.length) return people.slice(0, cap);
  const reserved = Math.min(2, extra.length);
  const keptPeople = people.slice(0, Math.max(0, cap - reserved));
  const keptCompanies = extra.slice(0, cap - keptPeople.length);
  return [...keptPeople, ...keptCompanies];
}

module.exports = {
  findPeople,
  personView,
  mergeMatches,
};
