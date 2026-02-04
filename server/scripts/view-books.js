require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function viewBooks() {
  console.log('\n📚 BOOKSHELF DATABASE STATUS');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Fetch all books
    const { data: books, error: booksError } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (booksError) {
      console.error('❌ Error fetching books:', booksError.message);
      return;
    }

    // Fetch all connections
    const { data: connections, error: connectionsError } = await supabase
      .from('book_connections')
      .select('*');

    if (connectionsError) {
      console.error('❌ Error fetching connections:', connectionsError.message);
      return;
    }

    // Display books
    console.log(`📖 Total Books: ${books.length}\n`);
    
    if (books.length === 0) {
      console.log('   No books uploaded yet.\n');
    } else {
      books.forEach((book, index) => {
        const dateRead = new Date(book.date_read).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        console.log(`${index + 1}. "${book.title}" by ${book.author}`);
        console.log(`   📅 Read: ${dateRead}`);
        console.log(`   🆔 ID: ${book.id}`);
        console.log(`   🖼️  Cover: ${book.cover_image_url.substring(0, 60)}...`);
        console.log('');
      });
    }

    // Display connections
    console.log('-'.repeat(60));
    console.log(`🔗 Total Connections: ${connections.length}\n`);
    
    if (connections.length === 0) {
      console.log('   No connections created yet.\n');
    } else {
      connections.forEach((conn, index) => {
        const fromBook = books.find(b => b.id === conn.from_book_id);
        const toBook = books.find(b => b.id === conn.to_book_id);
        
        if (fromBook && toBook) {
          console.log(`${index + 1}. "${fromBook.title}" ↔ "${toBook.title}"`);
        } else {
          console.log(`${index + 1}. Connection ${conn.id} (books not found)`);
        }
      });
      console.log('');
    }

    console.log('=' .repeat(60));
    console.log('✅ Database query complete!\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

viewBooks();
