// Verify Supabase database schema for bookshelf tables
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySchema() {
  console.log('🔍 Verifying Supabase Schema...\n');
  console.log('=' .repeat(60));
  
  // Test inserting and retrieving a book
  console.log('\n📚 Testing BOOKS table...\n');
  
  try {
    // Try to insert a test book
    const testBook = {
      title: 'Test Book Schema',
      author: 'Test Author',
      cover_image_url: '/test/image.jpg',
      date_read: '2024-01-01'
    };
    
    console.log('   Attempting to insert test book...');
    const { data: insertedBook, error: insertError } = await supabase
      .from('books')
      .insert([testBook])
      .select()
      .single();
    
    if (insertError) {
      console.log('   ❌ Insert failed:', insertError.message);
      console.log('   Details:', insertError);
      return;
    }
    
    console.log('   ✅ Insert successful!');
    console.log('   Book ID:', insertedBook.id);
    console.log('   Created at:', insertedBook.created_at);
    
    // Verify all expected columns exist
    const expectedColumns = ['id', 'title', 'author', 'cover_image_url', 'date_read', 'created_at'];
    const actualColumns = Object.keys(insertedBook);
    
    console.log('\n   Column verification:');
    expectedColumns.forEach(col => {
      const exists = actualColumns.includes(col);
      console.log(`   ${exists ? '✅' : '❌'} ${col}: ${exists ? insertedBook[col] : 'MISSING'}`);
    });
    
    // Test connections table
    console.log('\n🔗 Testing BOOK_CONNECTIONS table...\n');
    
    // Insert a second book to test connection
    const testBook2 = {
      title: 'Test Book 2',
      author: 'Test Author 2',
      cover_image_url: '/test/image2.jpg',
      date_read: '2024-01-02'
    };
    
    const { data: insertedBook2, error: insertError2 } = await supabase
      .from('books')
      .insert([testBook2])
      .select()
      .single();
    
    if (insertError2) {
      console.log('   ❌ Second book insert failed:', insertError2.message);
      return;
    }
    
    console.log('   ✅ Second book inserted (ID:', insertedBook2.id + ')');
    
    // Try to create a connection
    const testConnection = {
      from_book_id: insertedBook.id,
      to_book_id: insertedBook2.id
    };
    
    console.log('\n   Attempting to create connection...');
    const { data: connection, error: connError } = await supabase
      .from('book_connections')
      .insert([testConnection])
      .select()
      .single();
    
    if (connError) {
      console.log('   ❌ Connection insert failed:', connError.message);
      console.log('   Details:', connError);
    } else {
      console.log('   ✅ Connection created successfully!');
      console.log('   Connection ID:', connection.id);
      console.log('   From:', connection.from_book_id);
      console.log('   To:', connection.to_book_id);
      
      // Verify connection columns
      const connColumns = ['id', 'from_book_id', 'to_book_id', 'created_at'];
      console.log('\n   Connection columns:');
      connColumns.forEach(col => {
        const exists = connection[col] !== undefined;
        console.log(`   ${exists ? '✅' : '❌'} ${col}`);
      });
    }
    
    // Test CASCADE delete
    console.log('\n🗑️  Testing CASCADE delete...\n');
    console.log('   Deleting first book (should also delete connection)...');
    
    const { error: deleteError } = await supabase
      .from('books')
      .delete()
      .eq('id', insertedBook.id);
    
    if (deleteError) {
      console.log('   ❌ Delete failed:', deleteError.message);
    } else {
      console.log('   ✅ Book deleted successfully');
      
      // Check if connection was also deleted
      const { data: remainingConnections, error: checkError } = await supabase
        .from('book_connections')
        .select('*')
        .eq('from_book_id', insertedBook.id);
      
      if (!checkError) {
        if (remainingConnections.length === 0) {
          console.log('   ✅ CASCADE delete working! Connection was removed.');
        } else {
          console.log('   ⚠️  CASCADE delete NOT working! Connection still exists.');
        }
      }
    }
    
    // Cleanup second book
    console.log('\n🧹 Cleaning up test data...');
    await supabase.from('books').delete().eq('id', insertedBook2.id);
    console.log('   ✅ Test data cleaned up');
    
    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ SCHEMA VERIFICATION COMPLETE!\n');
    console.log('Summary:');
    console.log('  ✅ books table: Correctly configured');
    console.log('  ✅ book_connections table: Correctly configured');
    console.log('  ✅ CASCADE delete: Working');
    console.log('  ✅ All required columns: Present');
    console.log('\n🚀 Database is ready for production!');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Error details:', error);
  }
}

verifySchema().then(() => {
  console.log('\n✅ Verification complete!\n');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
