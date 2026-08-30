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

const { renderDiaryHtml } = require('../utils/diary-markdown');

// Database helper functions
function withRenderedHtml(entry) {
  return {
    ...entry,
    html: entry.content ? renderDiaryHtml(entry.content) : entry.html
  };
}

async function getEntries() {
  if (!supabase) {
    // Fallback to file storage if Supabase not configured
    const fs = require('fs');
    const path = require('path');
    const entriesPath = path.join(__dirname, '../../data/entries.json');
    try {
      const data = fs.readFileSync(entriesPath, 'utf8');
      return JSON.parse(data).map(withRenderedHtml);
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

    return (data || []).map(withRenderedHtml);
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
async function addBookConnection(fromId, toId, reason = null) {
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
      to_book_id: toId,
      reason: reason || null
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

// Replace every book connection with a provided set (research matching)
async function replaceAllBookConnections(connections) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const rows = (connections || []).map(conn => ({
      from_book_id: conn.from_book_id,
      to_book_id: conn.to_book_id,
      reason: conn.reason || null
    }));

    if (rows.length === 0) {
      return { success: false, error: 'No connections proposed; left the existing graph in place' };
    }

    const { error: deleteError } = await supabase
      .from('book_connections')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error('Error deleting connections:', deleteError);
      return { success: false, error: deleteError.message };
    }

    for (let i = 0; i < rows.length; i += 80) {
      const batch = rows.slice(i, i + 80);
      const { error: insertError } = await supabase
        .from('book_connections')
        .insert(batch);

      if (insertError) {
        console.error('Error creating connections:', insertError);
        return { success: false, error: insertError.message };
      }
    }

    return { success: true, connectionsCreated: rows.length };
  } catch (error) {
    console.error('Error replacing connections:', error);
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

async function updateBookResearch(bookId, { category, research_profile }) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const patch = {};
    if (category !== undefined) patch.category = category;
    if (research_profile !== undefined) patch.research_profile = research_profile;

    const { error } = await supabase
      .from('books')
      .update(patch)
      .eq('id', bookId);

    if (error) {
      console.error('Error updating book research:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating book research:', error);
    return { success: false, error: error.message };
  }
}

async function updateBookResearchAbout(bookId, about) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data: book, error: fetchError } = await supabase
      .from('books')
      .select('research_profile')
      .eq('id', bookId)
      .single();

    if (fetchError) {
      console.error('Error fetching book research:', fetchError);
      return { success: false, error: fetchError.message };
    }

    const research_profile = {
      ...(book.research_profile || {}),
      about: String(about || '').trim()
    };

    const { error } = await supabase
      .from('books')
      .update({ research_profile })
      .eq('id', bookId);

    if (error) {
      console.error('Error saving book research note:', error);
      return { success: false, error: error.message };
    }

    return { success: true, research_profile };
  } catch (error) {
    console.error('Error saving book research note:', error);
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

const EISENKIND_VERSIONS_LOCAL_PATH = require('path').join(
  __dirname,
  '../../data/eisenkind-story-versions.json'
);

function isEisenkindVersionsTableMissing(error) {
  const msg = error?.message || '';
  return (
    error?.code === '42P01' ||
    (/relation/i.test(msg) && /eisenkind_story_versions/i.test(msg) && /does not exist/i.test(msg))
  );
}

function formatEisenkindStoryVersion(row) {
  return {
    id: Number(row?.id),
    story: typeof row?.story === 'string' ? row.story : '',
    created_at: row?.created_at || null
  };
}

function readLocalEisenkindStoryVersions() {
  const fs = require('fs');
  try {
    const data = JSON.parse(fs.readFileSync(EISENKIND_VERSIONS_LOCAL_PATH, 'utf8'));
    if (!Array.isArray(data?.versions)) return [];
    return data.versions
      .map((row) => formatEisenkindStoryVersion(row))
      .filter((row) => Number.isFinite(row.id) && row.id > 0)
      .sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

function writeLocalEisenkindStoryVersions(versions) {
  const fs = require('fs');
  const path = require('path');
  const dir = path.dirname(EISENKIND_VERSIONS_LOCAL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    EISENKIND_VERSIONS_LOCAL_PATH,
    JSON.stringify({ versions }, null, 2),
    'utf8'
  );
}

async function listEisenkindStoryVersionsMeta() {
  if (!supabase) {
    return readLocalEisenkindStoryVersions().map(({ id, created_at }) => ({ id, created_at }));
  }

  try {
    const { data, error } = await supabase
      .from('eisenkind_story_versions')
      .select('id, created_at')
      .order('created_at', { ascending: true });

    if (error) {
      if (isEisenkindVersionsTableMissing(error)) return [];
      console.error('Error listing eisenkind story versions:', error);
      return [];
    }

    return (data || []).map((row) => ({
      id: Number(row.id),
      created_at: row.created_at || null
    }));
  } catch (error) {
    console.error('Error listing eisenkind story versions:', error);
    return [];
  }
}

async function getEisenkindStoryVersionById(versionId) {
  const id = Number(versionId);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (!supabase) {
    const match = readLocalEisenkindStoryVersions().find((row) => row.id === id);
    return match || null;
  }

  try {
    const { data, error } = await supabase
      .from('eisenkind_story_versions')
      .select('id, story, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (isEisenkindVersionsTableMissing(error)) return null;
      console.error('Error fetching eisenkind story version:', error);
      return null;
    }

    return data ? formatEisenkindStoryVersion(data) : null;
  } catch (error) {
    console.error('Error fetching eisenkind story version:', error);
    return null;
  }
}

async function appendEisenkindStoryVersion(story) {
  const trimmed = (story || '').trim();
  if (!trimmed) return { success: false, skipped: true };

  const versions = await listEisenkindStoryVersionsMeta();
  if (versions.length) {
    const latest = await getEisenkindStoryVersionById(versions[versions.length - 1].id);
    if (latest?.story?.trim() === trimmed) {
      return { success: true, skipped: true, version: latest };
    }
  }

  const createdAt = new Date().toISOString();

  if (!supabase) {
    const local = readLocalEisenkindStoryVersions();
    const nextId = local.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    const version = { id: nextId, story: trimmed, created_at: createdAt };
    writeLocalEisenkindStoryVersions([...local, version]);
    return { success: true, version };
  }

  try {
    const { data, error } = await supabase
      .from('eisenkind_story_versions')
      .insert({ story: trimmed, created_at: createdAt })
      .select('id, story, created_at')
      .single();

    if (error) {
      if (isEisenkindVersionsTableMissing(error)) {
        return {
          success: false,
          error:
            'Table eisenkind_story_versions missing. Run server/scripts/create-eisenkind-story-versions-table.sql in Supabase SQL Editor.'
        };
      }
      console.error('Error saving eisenkind story version:', error);
      return { success: false, error: error.message };
    }

    return { success: true, version: formatEisenkindStoryVersion(data) };
  } catch (error) {
    console.error('Error saving eisenkind story version:', error);
    return { success: false, error: error.message };
  }
}

async function ensureEisenkindStoryVersionsBootstrapped() {
  const versions = await listEisenkindStoryVersionsMeta();
  if (versions.length) return versions;

  const notes = await getEisenkindNotes();
  if (!notes.story?.trim()) return versions;

  await appendEisenkindStoryVersion(notes.story);
  return listEisenkindStoryVersionsMeta();
}

const CAUSE_DEFAULT_GRAPH = {
  points: [
    { id: 'a', title: 'POINT A', description: '', condition: '' },
    { id: 'b', title: 'POINT B', description: '', condition: '@POINT A' }
  ],
  edges: []
};

function normalizeCauseGraph(graph) {
  if (!graph || typeof graph !== 'object') {
    return { ...CAUSE_DEFAULT_GRAPH, positions: undefined };
  }

  return {
    points: Array.isArray(graph.points)
      ? graph.points.map((p) => ({
          id: String(p.id ?? ''),
          title: String(p.title ?? '').toUpperCase(),
          description: String(p.description ?? ''),
          condition: String(p.condition ?? '')
        }))
      : CAUSE_DEFAULT_GRAPH.points,
    edges: Array.isArray(graph.edges)
      ? graph.edges.map((e) => ({
          id: String(e.id ?? ''),
          fromId: String(e.fromId ?? ''),
          toId: String(e.toId ?? ''),
          unlockCondition: String(e.unlockCondition ?? '')
        }))
      : [],
    positions:
      graph.positions && typeof graph.positions === 'object'
        ? graph.positions
        : undefined
  };
}

async function getCauseGraph() {
  if (!supabase) {
    const fs = require('fs');
    const path = require('path');
    const graphPath = path.join(__dirname, '../../data/cause-graph.json');
    try {
      const data = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
      return normalizeCauseGraph(data);
    } catch {
      return normalizeCauseGraph(CAUSE_DEFAULT_GRAPH);
    }
  }

  try {
    const { data, error } = await supabase
      .from('cause_graph')
      .select('graph, updated_at')
      .eq('id', 'main')
      .maybeSingle();

    if (error) {
      console.error('Error fetching cause graph:', error);
      return normalizeCauseGraph(CAUSE_DEFAULT_GRAPH);
    }

    if (!data?.graph) {
      return normalizeCauseGraph(CAUSE_DEFAULT_GRAPH);
    }

    return normalizeCauseGraph(data.graph);
  } catch (error) {
    console.error('Error fetching cause graph:', error);
    return normalizeCauseGraph(CAUSE_DEFAULT_GRAPH);
  }
}

async function saveCauseGraph(graph) {
  const normalized = normalizeCauseGraph(graph);
  const now = new Date().toISOString();
  const payload = {
    id: 'main',
    graph: normalized,
    updated_at: now
  };

  if (!supabase) {
    const fs = require('fs');
    const path = require('path');
    const graphPath = path.join(__dirname, '../../data/cause-graph.json');
    try {
      const dir = path.dirname(graphPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(graphPath, JSON.stringify(normalized, null, 2), 'utf8');
      return { success: true, graph: normalized, updated_at: now };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  try {
    const { data, error } = await supabase
      .from('cause_graph')
      .upsert(payload, { onConflict: 'id' })
      .select('graph, updated_at')
      .single();

    if (error) {
      console.error('Error saving cause graph:', error);
      return { success: false, error: error.message };
    }

    return {
      success: true,
      graph: normalizeCauseGraph(data.graph),
      updated_at: data.updated_at
    };
  } catch (error) {
    console.error('Error saving cause graph:', error);
    return { success: false, error: error.message };
  }
}

async function getCeCategories() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('ce_categories')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching CE categories:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching CE categories:', error);
    return [];
  }
}

async function getNextCeCategorySortOrder() {
  const { data, error } = await supabase
    .from('ce_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching CE category sort order:', error);
    return 0;
  }

  return data ? data.sort_order + 1 : 0;
}

async function getOrCreateCeCategory(name) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    return { success: false, error: 'Category name is required' };
  }

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('ce_categories')
      .select('*')
      .ilike('name', trimmedName)
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching CE category:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (existing) {
      return { success: true, category: existing, created: false };
    }

    const sortOrder = await getNextCeCategorySortOrder();

    const { data, error } = await supabase
      .from('ce_categories')
      .insert([{ name: trimmedName, sort_order: sortOrder }])
      .select()
      .single();

    if (error) {
      console.error('Error creating CE category:', error);
      return { success: false, error: error.message };
    }

    return { success: true, category: data, created: true };
  } catch (error) {
    console.error('Error resolving CE category:', error);
    return { success: false, error: error.message };
  }
}

async function getCeVideosByCategory(categoryId) {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('ce_videos')
      .select('*')
      .eq('category_id', categoryId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching CE videos:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching CE videos:', error);
    return [];
  }
}

async function getNextCeVideoSortOrder(categoryId) {
  const { data, error } = await supabase
    .from('ce_videos')
    .select('sort_order')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching CE video sort order:', error);
    return 0;
  }

  return data ? data.sort_order + 1 : 0;
}

async function getCeData() {
  if (!supabase) {
    return [];
  }

  try {
    const [categoriesResult, videosResult] = await Promise.all([
      supabase.from('ce_categories').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
      supabase.from('ce_videos').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
    ]);

    if (categoriesResult.error) {
      console.error('Error fetching CE categories:', categoriesResult.error);
      return [];
    }

    if (videosResult.error) {
      console.error('Error fetching CE videos:', videosResult.error);
      return [];
    }

    const categories = categoriesResult.data || [];
    const videos = videosResult.data || [];

    return categories.map((category) => ({
      ...category,
      videos: videos.filter((video) => video.category_id === category.id)
    }));
  } catch (error) {
    console.error('Error fetching CE data:', error);
    return [];
  }
}

async function updateCeCategoryOrder(orderedIds) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, error: 'Category order is required' };
  }

  try {
    const updates = orderedIds.map((id, index) =>
      supabase
        .from('ce_categories')
        .update({ sort_order: index })
        .eq('id', id)
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      console.error('Error updating CE category order:', failed.error);
      return { success: false, error: failed.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating CE category order:', error);
    return { success: false, error: error.message };
  }
}

async function updateCeVideoOrder(categoryId, orderedIds) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  if (!categoryId) {
    return { success: false, error: 'Category id is required' };
  }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, error: 'Video order is required' };
  }

  try {
    const updates = orderedIds.map((id, index) =>
      supabase
        .from('ce_videos')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('category_id', categoryId)
    );

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      console.error('Error updating CE video order:', failed.error);
      return { success: false, error: failed.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating CE video order:', error);
    return { success: false, error: error.message };
  }
}

async function deleteCeVideo(videoId) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  if (!videoId) {
    return { success: false, error: 'Video id is required' };
  }

  try {
    const { error } = await supabase
      .from('ce_videos')
      .delete()
      .eq('id', videoId);

    if (error) {
      console.error('Error deleting CE video:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting CE video:', error);
    return { success: false, error: error.message };
  }
}

async function addCeVideo(videoData) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const sortOrder = await getNextCeVideoSortOrder(videoData.category_id);
    const payload = { ...videoData, sort_order: sortOrder };

    const { data, error } = await supabase
      .from('ce_videos')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('Error adding CE video:', error);
      return { success: false, error: error.message };
    }

    return { success: true, video: data };
  } catch (error) {
    console.error('Error adding CE video:', error);
    return { success: false, error: error.message };
  }
}

// Corner selfie wall (Lebensjahre 0–99)
async function getCornerSelfies() {
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('corner_selfies')
      .select('year, image_url, updated_at')
      .order('year', { ascending: true });

    if (error) {
      console.error('Error fetching corner selfies:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching corner selfies:', error);
    return [];
  }
}

async function getCornerSelfie(year) {
  if (!supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('corner_selfies')
      .select('year, image_url, updated_at')
      .eq('year', year)
      .maybeSingle();

    if (error) {
      console.error('Error fetching corner selfie:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching corner selfie:', error);
    return null;
  }
}

async function upsertCornerSelfie(year, imageUrl) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('corner_selfies')
      .upsert(
        {
          year,
          image_url: imageUrl,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'year' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error upserting corner selfie:', error);
      return { success: false, error: error.message };
    }

    return { success: true, selfie: data };
  } catch (error) {
    console.error('Error upserting corner selfie:', error);
    return { success: false, error: error.message };
  }
}

async function deleteCornerSelfie(year) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const existing = await getCornerSelfie(year);
    const { error } = await supabase
      .from('corner_selfies')
      .delete()
      .eq('year', year);

    if (error) {
      console.error('Error deleting corner selfie:', error);
      return { success: false, error: error.message };
    }

    return { success: true, selfie: existing };
  } catch (error) {
    console.error('Error deleting corner selfie:', error);
    return { success: false, error: error.message };
  }
}

function defaultLiquiditySettings() {
  return {
    id: 'main',
    starting_balance_usd: 0,
    starting_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

function coerceLiquiditySettings(row) {
  const fallback = defaultLiquiditySettings();
  if (!row) return fallback;
  const starting = Number(row.starting_balance_usd);
  return {
    id: row.id || 'main',
    starting_balance_usd: Number.isFinite(starting) ? starting : fallback.starting_balance_usd,
    starting_at: row.starting_at || fallback.starting_at,
    updated_at: row.updated_at || fallback.updated_at
  };
}

async function getLiquiditySettings() {
  if (!supabase) {
    return defaultLiquiditySettings();
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_settings')
      .select('*')
      .eq('id', 'main')
      .maybeSingle();

    if (error) {
      console.error('Error fetching liquidity settings:', error);
      return defaultLiquiditySettings();
    }

    if (!data) {
      const inserted = await upsertLiquiditySettings(defaultLiquiditySettings());
      return inserted.success ? inserted.settings : defaultLiquiditySettings();
    }

    return coerceLiquiditySettings(data);
  } catch (error) {
    console.error('Error fetching liquidity settings:', error);
    return defaultLiquiditySettings();
  }
}

async function upsertLiquiditySettings(settings) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  const row = {
    id: 'main',
    starting_balance_usd: settings.starting_balance_usd,
    starting_at: settings.starting_at,
    updated_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('liquidity_settings')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving liquidity settings:', error);
      return { success: false, error: error.message };
    }

    return { success: true, settings: coerceLiquiditySettings(data) };
  } catch (error) {
    console.error('Error saving liquidity settings:', error);
    return { success: false, error: error.message };
  }
}

async function getLiquidityEntries() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('liquidity_entries')
      .select('*')
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Error fetching liquidity entries:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching liquidity entries:', error);
    return [];
  }
}

async function createLiquidityEntry(entry) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_entries')
      .insert([entry])
      .select()
      .single();

    if (error) {
      console.error('Error creating liquidity entry:', error);
      return { success: false, error: error.message };
    }

    return { success: true, entry: data };
  } catch (error) {
    console.error('Error creating liquidity entry:', error);
    return { success: false, error: error.message };
  }
}

async function createLiquidityEntries(entries) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }
  if (!entries.length) {
    return { success: true, entries: [] };
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_entries')
      .upsert(entries, { onConflict: 'id', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error('Error creating liquidity entries:', error);
      return { success: false, error: error.message };
    }

    return { success: true, entries: data || [] };
  } catch (error) {
    console.error('Error creating liquidity entries:', error);
    return { success: false, error: error.message };
  }
}

async function deleteLiquidityEntry(id) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('liquidity_entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting liquidity entry:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting liquidity entry:', error);
    return { success: false, error: error.message };
  }
}

async function getLiquidityRecurring() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('liquidity_recurring')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching liquidity recurring:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching liquidity recurring:', error);
    return [];
  }
}

async function createLiquidityRecurring(item) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_recurring')
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error('Error creating liquidity recurring:', error);
      return { success: false, error: error.message };
    }

    return { success: true, item: data };
  } catch (error) {
    console.error('Error creating liquidity recurring:', error);
    return { success: false, error: error.message };
  }
}

async function deleteLiquidityRecurring(id) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('liquidity_recurring')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting liquidity recurring:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting liquidity recurring:', error);
    return { success: false, error: error.message };
  }
}

function sortLiabilities(rows) {
  return [...(rows || [])].sort((a, b) => {
    if (!a.due_date && b.due_date) return -1;
    if (a.due_date && !b.due_date) return 1;
    if (a.due_date && b.due_date && a.due_date !== b.due_date) {
      return String(a.due_date).localeCompare(String(b.due_date));
    }
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

async function getLiquidityLiabilities() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('liquidity_liabilities')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching liquidity liabilities:', error);
      return [];
    }

    return sortLiabilities(data);
  } catch (error) {
    console.error('Error fetching liquidity liabilities:', error);
    return [];
  }
}

async function getLiquidityLiability(id) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('liquidity_liabilities')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching liquidity liability:', error);
      return null;
    }

    return data || null;
  } catch (error) {
    console.error('Error fetching liquidity liability:', error);
    return null;
  }
}

async function createLiquidityLiability(item) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_liabilities')
      .insert([item])
      .select()
      .single();

    if (error) {
      console.error('Error creating liquidity liability:', error);
      return { success: false, error: error.message };
    }

    return { success: true, item: data };
  } catch (error) {
    console.error('Error creating liquidity liability:', error);
    return { success: false, error: error.message };
  }
}

async function updateLiquidityLiability(id, fields) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { data, error } = await supabase
      .from('liquidity_liabilities')
      .update(fields)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating liquidity liability:', error);
      return { success: false, error: error.message };
    }

    return { success: true, item: data };
  } catch (error) {
    console.error('Error updating liquidity liability:', error);
    return { success: false, error: error.message };
  }
}

async function deleteLiquidityLiability(id) {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const { error } = await supabase
      .from('liquidity_liabilities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting liquidity liability:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting liquidity liability:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getEntries,
  createEntry,
  deleteEntry,
  getEisenkindNotes,
  updateEisenkindNotes,
  listEisenkindStoryVersionsMeta,
  getEisenkindStoryVersionById,
  appendEisenkindStoryVersion,
  ensureEisenkindStoryVersionsBootstrapped,
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
  replaceAllBookConnections,
  updateBookCategory,
  updateBookResearch,
  updateBookResearchAbout,
  updateBookReadingTime,
  getCauseGraph,
  saveCauseGraph,
  // Company Education functions
  getCeCategories,
  getOrCreateCeCategory,
  getCeData,
  getCeVideosByCategory,
  updateCeCategoryOrder,
  updateCeVideoOrder,
  deleteCeVideo,
  addCeVideo,
  // Corner selfie wall
  getCornerSelfies,
  getCornerSelfie,
  upsertCornerSelfie,
  deleteCornerSelfie,
  // Liquidity
  getLiquiditySettings,
  upsertLiquiditySettings,
  getLiquidityEntries,
  createLiquidityEntry,
  createLiquidityEntries,
  deleteLiquidityEntry,
  getLiquidityRecurring,
  createLiquidityRecurring,
  deleteLiquidityRecurring,
  getLiquidityLiabilities,
  getLiquidityLiability,
  createLiquidityLiability,
  updateLiquidityLiability,
  deleteLiquidityLiability,
  isConfigured: () => supabase !== null
};

