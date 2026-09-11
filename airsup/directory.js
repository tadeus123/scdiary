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

function publicDisplayName({ answers, displayName, email } = {}) {
  const fromAnswers = clip(answers && answers.full_name, 120).replace(/\s+/g, ' ').trim();
  if (fromAnswers) return fromAnswers;
  return displayNameFrom({ displayName, email }).replace(/\s+/g, ' ').trim();
}

function signedInBuyerName(caller) {
  const email = clip(caller && caller.email, 320);
  const listed = clip(caller && caller.display_name, 120);
  if (!email) return listed || 'Airsup buyer';
  const local = (email.split('@')[0] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const listedKey = listed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (listed && local && (listedKey.includes(local) || (listedKey.length > 2 && local.includes(listedKey)))) {
    return listed;
  }
  return email;
}

function publicFieldsFromAnswers(answers) {
  const source = answers && typeof answers === 'object' ? answers : {};
  return {
    help_with: clip(source.help_others),
    need_help_with: clip(source.dreams),
    desired_person: clip(source.person_to_meet),
  };
}

module.exports = {
  clip,
  displayNameFrom,
  publicDisplayName,
  signedInBuyerName,
  publicFieldsFromAnswers,
};
