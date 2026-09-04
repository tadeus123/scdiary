const QUESTIONS = [
  { id: 'sets_on_fire', text: 'What sets you on fire?' },
  { id: 'grew_up', text: 'How did you grow up?' },
  { id: 'help_others', text: 'Do you think you can help other people with something?' },
  { id: 'sex_frequency', text: 'How often would you like to have sex?' },
  { id: 'dreams', text: 'Any dreams for your life?' },
  { id: 'honest_person', text: 'Are you an honest person and not a dick?' },
  { id: 'book_recommend', text: 'What book would you recommend to others?' },
  { id: 'last_cry', text: 'When did you cry the last time, and why?' },
  { id: 'most_proud', text: 'What are you most proud of in your life?' },
  { id: 'person_to_meet', text: 'Which kind of person would you love to meet in your life?' },
  { id: 'sex_life', text: 'How is your sex life?' },
  { id: 'spread_universe', text: 'Do you think humanity should spread into the universe?' },
  { id: 'bookshelf', text: 'Share your bookshelf.' },
  { id: 'alone_universe', text: 'Are we alone in the universe?' },
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
