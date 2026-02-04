require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { analyzeAllBooks } = require('../services/similarity');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSmartConnections() {
  console.log('\n🤖 AI SMART CONNECTIONS BUILDER');
  console.log('='.repeat(60));
  console.log('Similarity Threshold: ≥ 5/10');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Fetch all books with categories
    const { data: books, error: fetchError } = await supabase
      .from('books')
      .select('id, title, author, category')
      .not('category', 'is', null)
      .order('category', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching books:', fetchError.message);
      return;
    }

    console.log(`📚 Found ${books.length} categorized books\n`);

    // Delete all existing connections first
    console.log('🗑️  Deleting old connections...\n');
    const { error: deleteError } = await supabase
      .from('book_connections')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('❌ Error deleting connections:', deleteError.message);
      return;
    }

    console.log('✅ Old connections deleted\n');

    // Analyze books and create smart connections
    console.log('🤖 Starting AI similarity analysis...\n');
    console.log('⚠️  This will take several minutes...\n');

    const connections = await analyzeAllBooks(books, 5); // Threshold: 5

    // Insert new connections to database
    if (connections.length > 0) {
      console.log(`\n💾 Saving ${connections.length} smart connections to database...\n`);

      // Remove score field before inserting (not in database schema)
      const dbConnections = connections.map(conn => ({
        from_book_id: conn.from_book_id,
        to_book_id: conn.to_book_id
      }));

      const { error: insertError } = await supabase
        .from('book_connections')
        .insert(dbConnections);

      if (insertError) {
        console.error('❌ Error inserting connections:', insertError.message);
        return;
      }

      console.log('✅ Smart connections saved!\n');
    } else {
      console.log('\n⚠️  No connections met the threshold (≥5)\n');
    }

    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY\n');
    console.log(`   Total connections created: ${connections.length}`);
    
    // Count by category
    const booksByCategory = {};
    books.forEach(book => {
      booksByCategory[book.category] = (booksByCategory[book.category] || 0) + 1;
    });

    console.log('\n   Books per category:');
    Object.entries(booksByCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        const categoryConnections = connections.filter(conn => {
          const book1 = books.find(b => b.id === conn.from_book_id);
          const book2 = books.find(b => b.id === conn.to_book_id);
          return book1 && book2 && book1.category === category;
        });
        console.log(`   - ${category}: ${count} books, ${categoryConnections.length} connections`);
      });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Smart connections complete!\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    console.error(error);
  }
}

// Run the script
createSmartConnections();
