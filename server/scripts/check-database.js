// Script to check what tables exist in Supabase
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('🔍 Checking Supabase database...\n');
  console.log('📊 Project URL:', supabaseUrl);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Check entries table
  try {
    const { data: entries, error: entriesError } = await supabase
      .from('entries')
      .select('*', { count: 'exact', head: true });
    
    if (entriesError) {
      console.log('❌ entries table: Does not exist or no access');
      console.log('   Error:', entriesError.message);
    } else {
      console.log('✅ entries table: EXISTS');
      const { count } = await supabase.from('entries').select('*', { count: 'exact', head: true });
      console.log(`   Records: ${count || 0}`);
    }
  } catch (error) {
    console.log('❌ entries table: Error checking -', error.message);
  }
  
  console.log('');
  
  // Check goals table
  try {
    const { data: goals, error: goalsError } = await supabase
      .from('goals')
      .select('*', { count: 'exact', head: true });
    
    if (goalsError) {
      console.log('❌ goals table: Does not exist or no access');
      console.log('   Error:', goalsError.message);
    } else {
      console.log('✅ goals table: EXISTS');
      const { count } = await supabase.from('goals').select('*', { count: 'exact', head: true });
      console.log(`   Records: ${count || 0}`);
    }
  } catch (error) {
    console.log('❌ goals table: Error checking -', error.message);
  }
  
  console.log('');
  
  // Check books table (for our new feature)
  try {
    const { data: books, error: booksError } = await supabase
      .from('books')
      .select('*', { count: 'exact', head: true });
    
    if (booksError) {
      console.log('❌ books table: Does not exist yet (EXPECTED - we need to create it)');
    } else {
      console.log('✅ books table: EXISTS');
      const { count } = await supabase.from('books').select('*', { count: 'exact', head: true });
      console.log(`   Records: ${count || 0}`);
    }
  } catch (error) {
    console.log('❌ books table: Does not exist yet (EXPECTED)');
  }
  
  console.log('');
  
  // Check book_connections table
  try {
    const { data: connections, error: connectionsError } = await supabase
      .from('book_connections')
      .select('*', { count: 'exact', head: true });
    
    if (connectionsError) {
      console.log('❌ book_connections table: Does not exist yet (EXPECTED - we need to create it)');
    } else {
      console.log('✅ book_connections table: EXISTS');
      const { count } = await supabase.from('book_connections').select('*', { count: 'exact', head: true });
      console.log(`   Records: ${count || 0}`);
    }
  } catch (error) {
    console.log('❌ book_connections table: Does not exist yet (EXPECTED)');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📋 Summary:');
  console.log('   - Existing tables: entries, goals (used by diary)');
  console.log('   - Need to create: books, book_connections (for bookshelf)');
  console.log('');
}

checkDatabase().then(() => {
  console.log('✅ Database check complete!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
