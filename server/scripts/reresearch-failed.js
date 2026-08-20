require('dotenv').config();
const { getBooks, updateBookResearch, replaceAllBookConnections } = require('../db/supabase');
const { researchBooks, researchLooksUntrusted, proposeConnections } = require('../services/book-matching');

async function reresearchFailed() {
  const books = await getBooks();
  const failed = books.filter(book => researchLooksUntrusted(book.research_profile?.about));

  console.log(`Books needing web-search research: ${failed.length}`);
  failed.forEach(book => console.log(`- ${book.title} / ${book.author}`));

  if (!failed.length) {
    return;
  }

  const researched = await researchBooks(failed);
  for (const book of researched) {
    const result = await updateBookResearch(book.id, {
      category: book.category,
      research_profile: book.research_profile
    });
    if (!result.success) {
      console.error(`Failed to save "${book.title}": ${result.error}`);
    } else {
      console.log(`Saved "${book.title}" [${book.research_profile.category}]: ${book.research_profile.about}`);
    }
  }

  const latest = await getBooks();
  const matches = await proposeConnections(latest);
  const saved = await replaceAllBookConnections(matches);
  if (!saved.success) {
    console.error('Failed to rebuild connections:', saved.error);
    return;
  }
  console.log(`Rebuilt ${saved.connectionsCreated} connections.`);
}

reresearchFailed().catch(error => {
  console.error(error);
  process.exit(1);
});
