const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️  Supabase credentials not found. Using file storage fallback.');
}

const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Database helper functions
async function getEntries() {
  if (!supabase) {
    // Fallback to file storage if Supabase not configured
    const fs = require('fs');
    const path = require('path');
    const entriesPath = path.join(__dirname, '../../data/entries.json');
    try {
      const data = fs.readFileSync(entriesPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  try {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching entries:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching entries:', error);
    return [];
  }
}

async function createEntry(entry) {
  if (!supabase) {
    // Fallback to file storage
    const fs = require('fs');
    const path = require('path');
    const entriesPath = path.join(__dirname, '../../data/entries.json');
    try {
      const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
      entries.push(entry);
      fs.writeFileSync(entriesPath, JSON.stringify(entries, null, 2), 'utf8');
      return { success: true, entry };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { data, error } = await supabase
      .from('entries')
      .insert([entry])
      .select()
      .single();

    if (error) {
      console.error('Error creating entry:', error);
      return { success: false, error: error.message };
    }

    return { success: true, entry: data };
  } catch (error) {
    console.error('Error creating entry:', error);
    return { success: false, error: error.message };
  }
}

async function deleteEntry(id) {
  if (!supabase) {
    // Fallback to file storage
    const fs = require('fs');
    const path = require('path');
    const entriesPath = path.join(__dirname, '../../data/entries.json');
    try {
      const entries = JSON.parse(fs.readFileSync(entriesPath, 'utf8'));
      const filtered = entries.filter(e => e.id !== id);
      if (filtered.length === entries.length) {
        return { success: false, error: 'Entry not found' };
      }
      fs.writeFileSync(entriesPath, JSON.stringify(filtered, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { error } = await supabase
      .from('entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting entry:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting entry:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getEntries,
  createEntry,
  deleteEntry,
  isConfigured: () => supabase !== null
};

