/**
 * Public AI endpoint directory.
 */

function clip(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function displayNameFrom(user) {
  const named = clip(user && user.displayName, 120);
  if (named) return named;
  const email = String((user && user.email) || '');
  const local = email.split('@')[0] || '';
  return local || 'the user';
}

/** Public directory heading. Prefer onboarding full name over the Google account name. */
function publicDisplayName({ answers, displayName, email } = {}) {
  const fromAnswers = clip(answers && answers.full_name, 120).replace(/\s+/g, ' ').trim();
  if (fromAnswers) return fromAnswers;
  return displayNameFrom({ displayName, email }).replace(/\s+/g, ' ').trim();
}

function publicFieldsFromAnswers(answers) {
  const source = answers && typeof answers === 'object' ? answers : {};
  return {
    help_with: clip(source.help_others),
    need_help_with: clip(source.dreams),
    desired_person: clip(source.person_to_meet),
  };
}

function publicCard(row) {
  if (!row || !row.active || !row.contactable) return null;
  const card = {
    endpoint_id: row.endpoint_id,
    display_name: row.display_name || 'the user',
    active: true,
    contactable: true,
  };
  if (row.share_help && row.help_with) card.help_with = row.help_with;
  if (row.share_need && row.need_help_with) card.need_help_with = row.need_help_with;
  if (row.share_desired_person && row.desired_person) card.desired_person = row.desired_person;
  if (row.contactable && row.endpoint_email) card.endpoint_email = row.endpoint_email;
  return card;
}

function tokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 2);
}

function overlap(query, field) {
  const needles = tokens(query);
  if (!needles.length) return 0;
  const hay = new Set(tokens(field));
  if (!hay.size) return 0;
  let hits = 0;
  for (const word of needles) {
    if (hay.has(word)) hits += 1;
  }
  return hits;
}

function scoreCard(card, { need, offer, desired_person }) {
  return (
    overlap(need, card.help_with) * 3 +
    overlap(offer, card.need_help_with) * 3 +
    overlap(desired_person, card.desired_person) * 2 +
    overlap(need, card.desired_person) +
    overlap(offer, card.help_with) +
    overlap(desired_person, card.help_with)
  );
}

function rankEndpoints(rows, query) {
  const need = clip(query.need);
  const offer = clip(query.offer);
  const desired = clip(query.desired_person);
  const exclude = String(query.exclude_endpoint_id || '').trim();

  return rows
    .filter((row) => row && row.active && row.contactable && row.endpoint_id !== exclude)
    .map((row) => publicCard(row))
    .filter(Boolean)
    .map((card) => ({
      ...card,
      match_score: scoreCard(card, { need, offer, desired_person: desired }),
    }))
    .sort((a, b) => b.match_score - a.match_score);
}

module.exports = {
  clip,
  displayNameFrom,
  publicDisplayName,
  publicFieldsFromAnswers,
  publicCard,
  rankEndpoints,
};
