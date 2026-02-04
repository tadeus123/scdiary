require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { categorizeBooksAI } = require('../services/categorization');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function categorizeAllBooks() {
  console.log('\n🤖 AI BOOK CATEGORIZATION');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Fetch all books
    const { data: books, error } = await supabase
      .from('books')
      .select('id, title, author, category')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Error fetching books:', error.message);
      return;
    }

    console.log(`📚 Found ${books.length} books to categorize\n`);

    // Filter books that need categorization (no category or category is null)
    const booksToCategorize = books.filter(b => !b.category);
    
    if (booksToCategorize.length === 0) {
      console.log('✅ All books already categorized!');
      console.log('');
      return;
    }

    console.log(`🔍 Categorizing ${booksToCategorize.length} books using AI...\n`);

    // Categorize books using AI
    const categorized = await categorizeBooksAI(booksToCategorize);

    // Update database
    console.log('\n💾 Updating database...\n');
    
    for (const book of categorized) {
      const { error: updateError } = await supabase
        .from('books')
        .update({ category: book.category })
        .eq('id', book.id);

      if (updateError) {
        console.error(`❌ Error updating "${book.title}":`, updateError.message);
      } else {
        console.log(`✅ "${book.title}" → ${book.category}`);
      }
    }

    // Summary by category
    console.log('\n' + '='.repeat(60));
    console.log('📊 CATEGORIZATION SUMMARY\n');

    const summary = categorized.reduce((acc, book) => {
      acc[book.category] = (acc[book.category] || 0) + 1;
      return acc;
    }, {});

    Object.entries(summary)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, count]) => {
        console.log(`   ${category}: ${count} books`);
      });

    console.log('\n' + '='.repeat(60));
    console.log('✅ Categorization complete!\n');

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

// Run the script
categorizeAllBooks();
