require('dotenv').config();
const { rebuildAllConnections } = require('../db/supabase');

async function rebuild() {
  console.log('\n🔗 REBUILDING ALL CONNECTIONS');
  console.log('='.repeat(60));
  console.log('');

  const result = await rebuildAllConnections();

  if (result.success) {
    console.log(`✅ Successfully created ${result.connectionsCreated} connections!`);
    console.log('   Books in the same category are now connected.\n');
    console.log('='.repeat(60));
  } else {
    console.error(`❌ Error: ${result.error}`);
  }
}

rebuild();
