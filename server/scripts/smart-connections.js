require('dotenv').config();
const { getBooks, updateBookResearch, replaceAllBookConnections } = require('../db/supabase');
const { researchBooks, proposeConnections } = require('../services/book-matching');

async function createSmartConnections() {
  console.log('\nAI BOOK RESEARCH + MATCHING');
  console.log('='.repeat(60));
  console.log('Each book is researched independently, then matched.');
  console.log('='.repeat(60));
  console.log('');

  try {
    const books = await getBooks();
    if (!books.length) {
      console.log('No books found.');
      return;
    }

    console.log(`Found ${books.length} books\n`);

    const researched = await researchBooks(books);

    for (const book of researched) {
      const result = await updateBookResearch(book.id, {
        category: book.category,
        research_profile: book.research_profile
      });
      if (!result.success) {
        console.error(`Failed to save research for "${book.title}": ${result.error}`);
      }
    }

    const matches = await proposeConnections(researched);
    const saved = await replaceAllBookConnections(matches);

    if (!saved.success) {
      console.error('Failed to save connections:', saved.error);
      return;
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Matched connections created: ${saved.connectionsCreated}`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Unexpected error:', error.message);
    console.error(error);
  }
}

createSmartConnections();
