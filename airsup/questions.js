const QUESTIONS = [
  { id: 'full_name', text: 'full name' },
  { id: 'geburtsdatum', text: 'geburtsdatum', private: true },
  { id: 'help_others', text: 'Do you think you can help other people with something?' },
  { id: 'dreams', text: 'Any dreams for your life?' },
  { id: 'person_to_meet', text: 'Which kind and types of person would you love to meet in your life?' },
  { id: 'book_recommend', text: 'a book you would recommend to others...' },
  { id: 'bookshelf', text: 'Share your book shelf:' },
  { id: 'spread_universe', text: 'Do you think humanity should spread into the universe?' },
  { id: 'alone_universe', text: 'are we alone in the universe?' },
  { id: 'honest_person', text: 'Are You a honest person and not a dick?' },
  { id: 'most_proud', text: 'What are you so far most proud of in your life?' },
  { id: 'grew_up', text: 'How did you grew up?', private: true },
  { id: 'last_cry', text: 'When did you cried the last time and why?', private: true },
  { id: 'sex_like', text: 'What sex do you like?', private: true },
  { id: 'sex_frequency', text: 'How often would you like to have sex?', private: true },
  { id: 'sex_life', text: 'How is your Sex :)', private: true },
];

const QUESTION_IDS = new Set(QUESTIONS.map((q) => q.id));

function normalizeAnswers(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const answers = {};
  for (const q of QUESTIONS) {
    const value = source[q.id];
    answers[q.id] = typeof value === 'string' ? value : '';
  }
  return answers;
}

module.exports = {
  QUESTIONS,
  QUESTION_IDS,
  normalizeAnswers,
};
