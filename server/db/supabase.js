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

// ========================================
// BOOKSHELF FUNCTIONS
// ========================================

// Get all books
async function getBooks() {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured for books');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('books')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching books:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching books:', error);
    return [];
  }
}

// Get all book connections
async function getBookConnections() {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured for book connections');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('book_connections')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching book connections:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching book connections:', error);
    return [];
  }
}

// Add a new book
async function addBook(bookData) {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('books')
      .insert([bookData])
      .select()
      .single();

    if (error) {
      console.error('Error adding book:', error);
      return { success: false, error: error.message };
    }

    return { success: true, book: data };
  } catch (error) {
    console.error('Error adding book:', error);
    return { success: false, error: error.message };
  }
}

// Create connection between books
async function addBookConnection(fromId, toId) {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Check if connection already exists (in either direction)
    const { data: existing } = await supabase
      .from('book_connections')
      .select('*')
      .or(`and(from_book_id.eq.${fromId},to_book_id.eq.${toId}),and(from_book_id.eq.${toId},to_book_id.eq.${fromId})`);

    if (existing && existing.length > 0) {
      return { success: false, error: 'Connection already exists' };
    }

    const connectionData = {
      from_book_id: fromId,
      to_book_id: toId
    };

    const { data, error } = await supabase
      .from('book_connections')
      .insert([connectionData])
      .select()
      .single();

    if (error) {
      console.error('Error creating connection:', error);
      return { success: false, error: error.message };
    }

    return { success: true, connection: data };
  } catch (error) {
    console.error('Error creating connection:', error);
    return { success: false, error: error.message };
  }
}

// Delete a book (connections will be deleted via CASCADE)
async function deleteBook(id) {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting book:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting book:', error);
    return { success: false, error: error.message };
  }
}

// Delete a specific connection
async function deleteConnection(id) {
  if (!supabase) {
    console.warn('⚠️  Supabase not configured');
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('book_connections')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting connection:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting connection:', error);
    return { success: false, error: error.message };
  }
}

// Get all book rereads
async function getAllBookRereads() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('book_rereads')
      .select('book_id, date_read')
      .order('date_read', { ascending: true });

    if (error) {
      if (error.code === '42P01') {
        console.warn('book_rereads table does not exist - run create-book-rereads-table.sql');
      } else {
        console.error('Error fetching book rereads:', error);
      }
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching book rereads:', error);
    return [];
  }
}

// Add a re-read for a book
async function addBookReread(bookId, dateRead) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('book_rereads')
      .insert([{ book_id: bookId, date_read: dateRead }])
      .select()
      .single();

    if (error) {
      const msg = error.code === '42P01'
        ? 'Run create-book-rereads-table.sql in Supabase first'
        : error.message;
      console.error('Error adding book reread:', error);
      return { success: false, error: msg };
    }

    return { success: true, reread: data };
  } catch (error) {
    console.error('Error adding book reread:', error);
    return { success: false, error: error.message };
  }
}

// Auto-create connections for a book based on its category
async function autoConnectBook(bookId, category) {
  if (!supabase || !category) {
    return { success: false, error: 'Invalid parameters' };
  }

  try {
    // Find all other books in the same category
    const { data: booksInCategory, error: fetchError } = await supabase
      .from('books')
      .select('id')
      .eq('category', category)
      .neq('id', bookId);

    if (fetchError) {
      console.error('Error fetching books in category:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (!booksInCategory || booksInCategory.length === 0) {
      return { success: true, connectionsCreated: 0 };
    }

    // Create connections to all books in the same category
    const connections = booksInCategory.map(book => ({
      from_book_id: bookId,
      to_book_id: book.id
    }));

    const { data, error: insertError } = await supabase
      .from('book_connections')
      .insert(connections)
      .select();

    if (insertError) {
      console.error('Error creating auto-connections:', insertError);
      return { success: false, error: insertError.message };
    }

    return { success: true, connectionsCreated: data.length };
  } catch (error) {
    console.error('Error in autoConnectBook:', error);
    return { success: false, error: error.message };
  }
}

// Rebuild all connections based on categories (deletes all, recreates)
async function rebuildAllConnections() {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Delete all existing connections
    const { error: deleteError } = await supabase
      .from('book_connections')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error deleting connections:', deleteError);
      return { success: false, error: deleteError.message };
    }

    // Get all books with categories
    const { data: books, error: fetchError } = await supabase
      .from('books')
      .select('id, category')
      .not('category', 'is', null);

    if (fetchError) {
      console.error('Error fetching books:', fetchError);
      return { success: false, error: fetchError.message };
    }

    // Group books by category
    const booksByCategory = {};
    books.forEach(book => {
      if (!booksByCategory[book.category]) {
        booksByCategory[book.category] = [];
      }
      booksByCategory[book.category].push(book.id);
    });

    // Create connections within each category
    const allConnections = [];
    Object.entries(booksByCategory).forEach(([category, bookIds]) => {
      // Connect each book to every other book in the same category
      for (let i = 0; i < bookIds.length; i++) {
        for (let j = i + 1; j < bookIds.length; j++) {
          allConnections.push({
            from_book_id: bookIds[i],
            to_book_id: bookIds[j]
          });
        }
      }
    });

    if (allConnections.length > 0) {
      const { error: insertError } = await supabase
        .from('book_connections')
        .insert(allConnections);

      if (insertError) {
        console.error('Error creating connections:', insertError);
        return { success: false, error: insertError.message };
      }
    }

    return { success: true, connectionsCreated: allConnections.length };
  } catch (error) {
    console.error('Error rebuilding connections:', error);
    return { success: false, error: error.message };
  }
}

// Update book category
async function updateBookCategory(bookId, category) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('books')
      .update({ category })
      .eq('id', bookId);

    if (error) {
      console.error('Error updating book category:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating book category:', error);
    return { success: false, error: error.message };
  }
}

// Update book reading time info (audio_duration_minutes only)
async function updateBookReadingTime(bookId, { audio_duration_minutes }) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('books')
      .update({ 
        audio_duration_minutes
      })
      .eq('id', bookId);

    if (error) {
      console.error('Error updating book reading time:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating book reading time:', error);
    return { success: false, error: error.message };
  }
}

const EISENKIND_DEFAULT_HEADLINE =
  'How to make humanoid robots that we love and that spread love?';

const EISENKIND_BLOCK_TYPES = ['principle', 'question', 'note', 'quote', 'entry'];

function isEisenkindHeadlineMissing(error) {
  const msg = error?.message || '';
  return error?.code === '42703' && /headline/i.test(msg);
}

function isEisenkindBlocksMissing(error) {
  const msg = error?.message || '';
  return error?.code === '42703' && /blocks/i.test(msg);
}

function isEisenkindStoryFieldsMissing(error) {
  const msg = error?.message || '';
  return (
    (error?.code === '42703' && /(brain_dump|story)/i.test(msg)) ||
    (error?.code === 'PGRST204' && /(brain_dump|story)/i.test(msg))
  );
}

function isEisenkindTableMissing(error) {
  const msg = error?.message || '';
  return (
    error?.code === '42P01' ||
    (/relation/i.test(msg) && /eisenkind_notes/i.test(msg) && /does not exist/i.test(msg))
  );
}

function formatEisenkindError(error) {
  if (isEisenkindTableMissing(error)) {
    return 'Table eisenkind_notes missing. Run server/scripts/create-eisenkind-notes-table.sql in Supabase SQL Editor.';
  }
  if (isEisenkindHeadlineMissing(error)) {
    return 'Column headline missing. Run server/scripts/add-eisenkind-headline-column.sql in Supabase SQL Editor.';
  }
  if (isEisenkindBlocksMissing(error)) {
    return 'Column blocks missing. Run server/scripts/add-eisenkind-blocks-column.sql in Supabase SQL Editor.';
  }
  if (isEisenkindStoryFieldsMissing(error)) {
    return 'Story columns missing. Run server/scripts/add-eisenkind-story-columns.sql in Supabase SQL Editor.';
  }
  return error?.message || 'Failed to save notes';
}

function newEisenkindBlockId() {
  return `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function legacyContentToBlocks(content) {
  const trimmed = (content || '').trim();
  if (!trimmed) return [];

  return trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((text) => ({
      id: newEisenkindBlockId(),
      type: 'note',
      text
    }));
}

function parseBlocksFromContent(content) {
  const trimmed = (content || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed?.blocks)) {
        return normalizeEisenkindBlocks(parsed.blocks);
      }
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeEisenkindBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((block) => {
      if (!block || typeof block.text !== 'string') return null;

      const text = block.text.trim();
      if (!text) return null;

      const type = EISENKIND_BLOCK_TYPES.includes(block.type) ? block.type : 'note';
      const normalized = {
        id: typeof block.id === 'string' && block.id ? block.id : newEisenkindBlockId(),
        type,
        text
      };

      if (type === 'entry' && typeof block.date === 'string' && block.date.trim()) {
        normalized.date = block.date.trim();
      }

      return normalized;
    })
    .filter(Boolean);
}

function resolveEisenkindBlocks({ blocks, content }) {
  const fromBlocks = normalizeEisenkindBlocks(blocks);
  if (fromBlocks.length) return fromBlocks;

  const fromJsonContent = parseBlocksFromContent(content);
  if (fromJsonContent?.length) return fromJsonContent;

  return legacyContentToBlocks(content);
}

function parseStoryPayloadFromContent(content) {
  const trimmed = (content || '').trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return {
      brain_dump: typeof parsed.brain_dump === 'string' ? parsed.brain_dump : '',
      story: typeof parsed.story === 'string' ? parsed.story : ''
    };
  } catch {
    return null;
  }
}

function blocksToPlainText(blocks) {
  return normalizeEisenkindBlocks(blocks)
    .map((block) => block.text)
    .join('\n\n');
}

function resolveBrainDump(row) {
  if (typeof row?.brain_dump === 'string' && row.brain_dump.trim()) {
    return row.brain_dump.trim();
  }

  const fromContent = parseStoryPayloadFromContent(row?.content);
  if (fromContent?.brain_dump?.trim()) return fromContent.brain_dump.trim();

  const blocks = resolveEisenkindBlocks({
    blocks: row?.blocks,
    content: row?.content
  });
  return blocksToPlainText(blocks);
}

function resolveStory(row) {
  if (typeof row?.story === 'string' && row.story.trim()) {
    return row.story.trim();
  }

  const fromContent = parseStoryPayloadFromContent(row?.content);
  if (fromContent?.story?.trim()) return fromContent.story.trim();

  const blocks = resolveEisenkindBlocks({
    blocks: row?.blocks,
    content: row?.content
  });
  return blocksToPlainText(blocks);
}

function formatEisenkindNotes(row) {
  const headline = row?.headline || EISENKIND_DEFAULT_HEADLINE;

  return {
    headline,
    brain_dump: resolveBrainDump(row),
    story: resolveStory(row),
    story_updated_at: row?.story_updated_at || null,
    updated_at: row?.updated_at || null
  };
}

function emptyEisenkindNotes() {
  return {
    headline: EISENKIND_DEFAULT_HEADLINE,
    brain_dump: '',
    story: '',
    story_updated_at: null,
    updated_at: null
  };
}

// Eisenkind notes (singleton document)
async function getEisenkindNotes() {
  if (!supabase) {
    const fs = require('fs');
    const path = require('path');
    const notesPath = path.join(__dirname, '../../data/eisenkind-notes.json');
    try {
      const data = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
      return formatEisenkindNotes(data);
    } catch {
      return emptyEisenkindNotes();
    }
  }

  try {
    const { data, error } = await supabase
      .from('eisenkind_notes')
      .select('headline, content, blocks, brain_dump, story, story_updated_at, updated_at')
      .eq('id', 'main')
      .maybeSingle();

    if (error && (isEisenkindHeadlineMissing(error) || isEisenkindBlocksMissing(error) || isEisenkindStoryFieldsMissing(error))) {
      const { data: legacy, error: legacyError } = await supabase
        .from('eisenkind_notes')
        .select('headline, content, blocks, updated_at')
        .eq('id', 'main')
        .maybeSingle();

      if (!legacyError) {
        return formatEisenkindNotes(legacy);
      }
    }

    if (error) {
      console.error('Error fetching eisenkind notes:', error);
      return emptyEisenkindNotes();
    }

    return formatEisenkindNotes(data);
  } catch (error) {
    console.error('Error fetching eisenkind notes:', error);
    return emptyEisenkindNotes();
  }
}

async function updateEisenkindNotes(updates = {}) {
  const current = await getEisenkindNotes();
  const now = new Date().toISOString();

  const nextHeadline =
    updates.headline !== undefined
      ? (updates.headline || '').trim() || EISENKIND_DEFAULT_HEADLINE
      : current.headline;
  const nextBrainDump = updates.brain_dump !== undefined ? updates.brain_dump : current.brain_dump;
  const nextStory = updates.story !== undefined ? updates.story : current.story;
  const nextStoryUpdatedAt =
    updates.story_updated_at !== undefined
      ? updates.story_updated_at
      : updates.story !== undefined
        ? now
        : current.story_updated_at;

  const payload = {
    id: 'main',
    headline: nextHeadline,
    brain_dump: nextBrainDump || '',
    story: nextStory || '',
    story_updated_at: nextStoryUpdatedAt,
    content: JSON.stringify({
      brain_dump: nextBrainDump || '',
      story: nextStory || ''
    }),
    updated_at: now
  };

  if (!supabase) {
    const fs = require('fs');
    const path = require('path');
    const notesPath = path.join(__dirname, '../../data/eisenkind-notes.json');
    try {
      const dir = path.dirname(notesPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const stored = {
        headline: payload.headline,
        brain_dump: payload.brain_dump,
        story: payload.story,
        story_updated_at: payload.story_updated_at,
        updated_at: payload.updated_at
      };
      fs.writeFileSync(notesPath, JSON.stringify(stored, null, 2), 'utf8');
      return { success: true, notes: stored };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { data, error } = await supabase
      .from('eisenkind_notes')
      .upsert(payload, { onConflict: 'id' })
      .select('headline, content, brain_dump, story, story_updated_at, updated_at')
      .single();

    if (error && isEisenkindStoryFieldsMissing(error)) {
      const slimPayload = {
        id: 'main',
        headline: payload.headline,
        content: payload.content,
        updated_at: payload.updated_at
      };
      const { data: legacy, error: legacyError } = await supabase
        .from('eisenkind_notes')
        .upsert(slimPayload, { onConflict: 'id' })
        .select('headline, content, updated_at')
        .single();

      if (!legacyError) {
        return {
          success: true,
          notes: formatEisenkindNotes({
            ...legacy,
            story_updated_at: payload.story_updated_at
          })
        };
      }
      error = legacyError;
    }

    if (error && isEisenkindHeadlineMissing(error)) {
      const slimPayload = {
        id: 'main',
        content: payload.content,
        updated_at: payload.updated_at
      };
      const { data: legacy, error: legacyError } = await supabase
        .from('eisenkind_notes')
        .upsert(slimPayload, { onConflict: 'id' })
        .select('content, updated_at')
        .single();

      if (!legacyError) {
        return {
          success: true,
          notes: formatEisenkindNotes({
            headline: payload.headline,
            content: legacy.content,
            story_updated_at: payload.story_updated_at,
            updated_at: legacy.updated_at
          })
        };
      }
      error = legacyError;
    }

    if (error) {
      console.error('Error updating eisenkind notes:', error);
      return { success: false, error: formatEisenkindError(error) };
    }

    return { success: true, notes: formatEisenkindNotes(data) };
  } catch (error) {
    console.error('Error updating eisenkind notes:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getEntries,
  createEntry,
  deleteEntry,
  getEisenkindNotes,
  updateEisenkindNotes,
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  // Bookshelf functions
  getBooks,
  getBookConnections,
  getAllBookRereads,
  addBookReread,
  addBook,
  addBookConnection,
  deleteBook,
  deleteConnection,
  autoConnectBook,
  rebuildAllConnections,
  updateBookCategory,
  updateBookReadingTime,
  isConfigured: () => supabase !== null
};

