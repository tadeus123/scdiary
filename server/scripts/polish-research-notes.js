require('dotenv').config();
const { getBooks, updateBookResearchAbout } = require('../db/supabase');
const { polishAbout } = require('../services/book-matching');

async function polishNotes() {
  const books = await getBooks();
  let changed = 0;

  for (const book of books) {
    const current = book.research_profile?.about || '';
    const polished = polishAbout(current).slice(0, 600);
    if (!current || polished === current) continue;

    const result = await updateBookResearchAbout(book.id, polished);
    if (!result.success) {
      console.error(`Failed "${book.title}": ${result.error}`);
      continue;
    }
    changed++;
    console.log(`\n${book.title}`);
    console.log(polished);
  }

  console.log(`\nPolished ${changed} notes.`);
}

polishNotes().catch(error => {
  console.error(error);
  process.exit(1);
});
