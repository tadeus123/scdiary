const QUESTIONS = [
  { id: 'full_name', text: 'full name' },
  { id: 'geburtsdatum', text: 'geburtsdatum' },
  { id: 'help_others', text: 'what can you actually do for someone' },
  { id: 'dreams', text: 'Any dreams for your life?' },
  { id: 'person_to_meet', text: 'who do you want to sit with' },
  { id: 'book_recommend', text: 'a book you would recommend to others...' },
  { id: 'bookshelf', text: 'Share your book shelf:' },
  { id: 'spread_universe', text: 'Do you think humanity should spread into the universe?' },
  { id: 'alone_universe', text: 'are we alone in the universe?' },
  { id: 'honest_person', text: 'Are You a honest person and not a dick?' },
  { id: 'most_proud', text: 'What are you so far most proud of in your life?' },
  { id: 'grew_up', text: 'How did you grew up?' },
  { id: 'last_cry', text: 'When did you cried the last time and why?' },
  { id: 'sex', text: 'sex. what you like, how often, how it is :)' },
];

const QUESTION_IDS = new Set(QUESTIONS.map((q) => q.id));

function joinParts(source, ids) {
  return ids
    .map((id) => String((source && source[id]) || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function normalizeAnswers(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const answers = {};
  for (const q of QUESTIONS) {
    const value = source[q.id];
    answers[q.id] = typeof value === 'string' ? value : '';
  }
  if (!String(answers.sex || '').trim()) {
    answers.sex = joinParts(source, ['sex_like', 'sex_frequency', 'sex_life']);
  }
  return answers;
}

module.exports = {
  QUESTIONS,
  QUESTION_IDS,
  normalizeAnswers,
};
