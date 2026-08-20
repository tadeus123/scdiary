require('dotenv').config();
const { getBooks, replaceAllBookConnections } = require('../db/supabase');
const { proposeConnections } = require('../services/book-matching');

async function rebuild() {
  console.log('\nREBUILDING CONNECTIONS FROM RESEARCH');
  console.log('='.repeat(60));
  console.log('');

  const books = await getBooks();
  const matches = await proposeConnections(books);
  const result = await replaceAllBookConnections(matches);

  if (result.success) {
    console.log(`Created ${result.connectionsCreated} matched connections.`);
    console.log('='.repeat(60));
  } else {
    console.error(`Error: ${result.error}`);
  }
}

rebuild();
