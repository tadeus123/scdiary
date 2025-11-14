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

// Goals functions
async function getGoals() {
  if (!supabase) {
    // Fallback to file storage if Supabase not configured
    const fs = require('fs');
    const path = require('path');
    const goalsPath = path.join(__dirname, '../../data/goals.json');
    try {
      const data = fs.readFileSync(goalsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return [];
    }
  }

  try {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching goals:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching goals:', error);
    return [];
  }
}

async function createGoal(goal) {
  if (!supabase) {
    // Fallback to file storage
    const fs = require('fs');
    const path = require('path');
    const goalsPath = path.join(__dirname, '../../data/goals.json');
    try {
      const goals = JSON.parse(fs.readFileSync(goalsPath, 'utf8') || '[]');
      goals.push(goal);
      fs.writeFileSync(goalsPath, JSON.stringify(goals, null, 2), 'utf8');
      return { success: true, goal };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { data, error } = await supabase
      .from('goals')
      .insert([goal])
      .select()
      .single();

    if (error) {
      console.error('Error creating goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, goal: data };
  } catch (error) {
    console.error('Error creating goal:', error);
    return { success: false, error: error.message };
  }
}

async function updateGoal(id, updates) {
  if (!supabase) {
    // Fallback to file storage
    const fs = require('fs');
    const path = require('path');
    const goalsPath = path.join(__dirname, '../../data/goals.json');
    try {
      const goals = JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
      const index = goals.findIndex(g => g.id === id);
      if (index === -1) {
        return { success: false, error: 'Goal not found' };
      }
      goals[index] = { ...goals[index], ...updates };
      fs.writeFileSync(goalsPath, JSON.stringify(goals, null, 2), 'utf8');
      return { success: true, goal: goals[index] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { data, error } = await supabase
      .from('goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true, goal: data };
  } catch (error) {
    console.error('Error updating goal:', error);
    return { success: false, error: error.message };
  }
}

async function deleteGoal(id) {
  if (!supabase) {
    // Fallback to file storage
    const fs = require('fs');
    const path = require('path');
    const goalsPath = path.join(__dirname, '../../data/goals.json');
    try {
      const goals = JSON.parse(fs.readFileSync(goalsPath, 'utf8'));
      const filtered = goals.filter(g => g.id !== id);
      if (filtered.length === goals.length) {
        return { success: false, error: 'Goal not found' };
      }
      fs.writeFileSync(goalsPath, JSON.stringify(filtered, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { error } = await supabase
      .from('goals')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting goal:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting goal:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getEntries,
  createEntry,
  deleteEntry,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  isConfigured: () => supabase !== null
};

