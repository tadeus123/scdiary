require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = 'gpt-4o';
const RESEARCH_CONCURRENCY = 5;

const CATEGORIES = [
  'Biography',
  'Technology',
  'Business',
  'Finance',
  'Philosophy',
  'Science Fiction',
  'Science',
  'Design',
  'Self-Help',
  'History',
  'Politics',
  'Other'
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mapInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((item, index) => fn(item, i + index)));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await sleep(150);
    }
  }
  return results;
}

function parseJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (block) {
      try {
        return JSON.parse(block[1].trim());
      } catch {
        // fall through
      }
    }
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function chatJson({ system, user, maxTokens = 800, temperature = 0.2 }) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' }
      })
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      const parsed = parseJson(content);
      if (!parsed) {
        throw new Error('Could not parse model JSON');
      }
      return parsed;
    }

    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || response.statusText;
    lastError = new Error(`OpenAI API error: ${message}`);

    const retryAfter = message.match(/try again in ([0-9.]+)s/i);
    if (!retryAfter && response.status !== 429) {
      throw lastError;
    }

    const waitMs = retryAfter
      ? Math.ceil(Number(retryAfter[1]) * 1000) + 400
      : 3000 * attempt;
    console.warn(`⏳ ${message} Waiting ${waitMs}ms (attempt ${attempt}/4)`);
    await sleep(waitMs);
  }

  throw lastError;
}

function normalizeProfile(raw, fallbackCategory) {
  const subjects = Array.isArray(raw.subjects) ? raw.subjects.filter(Boolean).slice(0, 8) : [];
  const people = Array.isArray(raw.people) ? raw.people.filter(Boolean).slice(0, 8) : [];
  const ideas = Array.isArray(raw.ideas) ? raw.ideas.filter(Boolean).slice(0, 6) : [];
  const category = CATEGORIES.includes(raw.category) ? raw.category : (fallbackCategory || 'Other');

  return {
    about: String(raw.about || '').trim().slice(0, 600),
    subjects,
    people,
    ideas,
    world: String(raw.world || '').trim().slice(0, 160),
    category
  };
}

function compactProfile(book) {
  const profile = book.research_profile || {};
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    about: profile.about || '',
    subjects: profile.subjects || [],
    people: profile.people || [],
    ideas: profile.ideas || [],
    world: profile.world || ''
  };
}

function formatBookForPrompt(book, index) {
  const profile = book.research_profile || {};
  const genre = profile.category || book.category || '';
  const lines = [
    `[${index}] "${book.title}" by ${book.author}`
  ];
  if (genre) lines.push(`Genre: ${genre}`);
  if (profile.about) lines.push(`About: ${profile.about}`);
  if (profile.subjects?.length) lines.push(`Subjects: ${profile.subjects.join(', ')}`);
  if (profile.people?.length) lines.push(`People/orgs: ${profile.people.join(', ')}`);
  if (profile.ideas?.length) lines.push(`Ideas: ${profile.ideas.join('; ')}`);
  if (profile.world) lines.push(`World: ${profile.world}`);
  return lines.join('\n');
}

function bookGenre(book) {
  return book.research_profile?.category || book.category || 'Other';
}

function embeddingText(book) {
  const profile = book.research_profile || {};
  const genre = profile.category || book.category || '';
  return [
    `"${book.title}" by ${book.author}`,
    genre ? `Genre: ${genre}` : '',
    profile.about || '',
    profile.subjects?.length ? `What it is about: ${profile.subjects.join(', ')}` : '',
    profile.people?.length ? `People: ${profile.people.join(', ')}` : '',
    profile.ideas?.length ? `Ideas: ${profile.ideas.join('; ')}` : '',
    profile.world || ''
  ].filter(Boolean).join('\n');
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function similarityScore(cosine) {
  return Math.round(Math.max(0, Math.min(10, cosine * 10)) * 10) / 10;
}

async function embedTexts(texts) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const vectors = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.error?.message || response.statusText;
      throw new Error(`OpenAI embeddings error: ${message}`);
    }

    const data = await response.json();
    const ordered = [...data.data].sort((a, b) => a.index - b.index);
    vectors.push(...ordered.map(item => item.embedding));
  }

  return vectors;
}

/**
 * Research one book in isolation — what it actually is, not how it compares.
 */
async function researchBook(title, author) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured');
    return normalizeProfile({ about: '', subjects: [], people: [], ideas: [], world: '', category: 'Other' });
  }

  const parsed = await chatJson({
    system: 'You research individual books. Identify the actual published work from title and author. Never invent a different famous book. If the work is obscure, say what it most likely is from the title and author without padding. Respond with JSON only.',
    user: `Research this book independently. Do not compare it to other books.

Title: "${title}"
Author: ${author}

Return JSON:
{
  "about": "2-3 sentences: what this specific book is and argues or recounts",
  "subjects": ["specific topics, not broad genres"],
  "people": ["named people, companies, or programs the book is actually about"],
  "ideas": ["specific theses, arguments, or through-lines"],
  "world": "era, place, or domain (short)",
  "category": "one of: ${CATEGORIES.join(', ')}"
}

Rules:
- Biography only if the book is substantially about a person's life
- Subjects must be specific ("Lockheed Skunk Works", "Apple 1976-2011") not "biography" or "business"
- If unsure, keep about short and subjects conservative`,
    maxTokens: 700,
    temperature: 0.2
  });

  return normalizeProfile(parsed);
}

async function researchBooks(books) {
  console.log(`🔍 Researching ${books.length} books independently with ${MODEL}...`);

  return mapInBatches(books, RESEARCH_CONCURRENCY, async (book, index) => {
    try {
      const research_profile = await researchBook(book.title, book.author);
      console.log(`✅ [${index + 1}/${books.length}] "${book.title}"`);
      return {
        ...book,
        category: research_profile.category,
        research_profile
      };
    } catch (error) {
      console.error(`❌ [${index + 1}/${books.length}] "${book.title}": ${error.message}`);
      return {
        ...book,
        category: book.category || 'Other',
        research_profile: book.research_profile || normalizeProfile({})
      };
    }
  });
}

function pairKey(idA, idB) {
  return [idA, idB].sort().join('|');
}

function extractIndexPairs(parsed, books, { onlyFromId } = {}) {
  const raw = parsed.connections || parsed.pairs || [];
  const byIndex = new Map(books.map((book, i) => [i + 1, book]));
  const seen = new Set();
  const connections = [];

  for (const item of raw) {
    const a = Number(Array.isArray(item) ? item[0] : item.a);
    const b = Number(Array.isArray(item) ? item[1] : item.b);
    const bookA = byIndex.get(a);
    const bookB = byIndex.get(b);
    if (!bookA || !bookB || bookA.id === bookB.id) continue;
    if (onlyFromId && bookA.id !== onlyFromId && bookB.id !== onlyFromId) continue;

    const key = pairKey(bookA.id, bookB.id);
    if (seen.has(key)) continue;
    seen.add(key);

    const [fromId, toId] = [bookA.id, bookB.id].sort();
    connections.push({
      from_book_id: fromId,
      to_book_id: toId,
      reason: String((Array.isArray(item) ? '' : item.reason) || 'related').trim().slice(0, 240)
    });
  }

  return connections;
}

function mergeConnections(lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const conn of list || []) {
      const key = pairKey(conn.from_book_id, conn.to_book_id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(conn);
    }
  }
  return out;
}

const HUMAN_CURATOR = `You are standing in front of a personal bookshelf with a pencil, drawing lines between books that belong together.

Think the way a person thinks — not with a score cutoff.

- Same kind of book usually belongs together. Biographies cluster with biographies. Science fiction with science fiction. Business with business.
- Draw extra lines where the subject, person, company, or world is the same.
- Draw lines across kinds when a human would: a Jobs biography to an Apple history, AI philosophy to a novel about machines.
- Be generous. When you hesitate, connect.
- Skip a pair only if you would never actually connect them.
- No numeric rules. If you would draw it, draw it.`;

const GENRE_SCORE_FLOOR = 4;

function sameGenreNeighborhood(books, vectors, { onlyFromId } = {}) {
  const connections = [];
  const seen = new Set();

  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const bookA = books[i];
      const bookB = books[j];
      if (!bookA?.id || !bookB?.id || bookA.id === bookB.id) continue;
      if (onlyFromId && bookA.id !== onlyFromId && bookB.id !== onlyFromId) continue;
      if (bookGenre(bookA) !== bookGenre(bookB)) continue;

      const score = similarityScore(cosineSimilarity(vectors[i], vectors[j]));
      if (!(score > GENRE_SCORE_FLOOR)) continue;

      const key = pairKey(bookA.id, bookB.id);
      if (seen.has(key)) continue;
      seen.add(key);

      const [fromId, toId] = [bookA.id, bookB.id].sort();
      connections.push({
        from_book_id: fromId,
        to_book_id: toId,
        reason: `${bookGenre(bookA)} · ${score}`
      });
    }
  }

  return connections;
}

async function proposeHumanConnections(books, { onlyFromId } = {}) {
  if (books.length < 2) return [];

  const catalog = books.map((book, i) => formatBookForPrompt(book, i + 1)).join('\n\n');
  const focus = onlyFromId
    ? 'Book [1] was just added. Which books would you connect it to? Every connection must include 1.'
    : 'Look at the whole shelf and draw the connections a person would draw — same kinds together, and extra lines where the subject really meets.';

  const parsed = await chatJson({
    system: HUMAN_CURATOR + (onlyFromId ? ' Only propose connections that include book [1].' : '') + ' Respond with JSON only.',
    user: `${focus}

${catalog}

Return JSON:
{
  "connections": [
    { "a": 1, "b": 6, "reason": "short human reason" }
  ]
}

Use bracket numbers. Be generous so neighborhoods form a web.`,
    maxTokens: onlyFromId ? 2500 : 5000,
    temperature: 0.4
  });

  return extractIndexPairs(parsed, books, { onlyFromId });
}

/**
 * Same-genre neighborhoods (score above 4), then gpt-4o adds the extra human lines.
 */
async function proposeConnections(books) {
  const usable = books.filter(book => book?.id && book?.title);
  if (usable.length < 2) return [];

  console.log(`🔗 Building same-genre neighborhoods, then ${MODEL} draws the extra human lines...`);
  const vectors = await embedTexts(usable.map(embeddingText));
  const neighborhood = sameGenreNeighborhood(usable, vectors);
  console.log(`🔗 Same-genre neighborhood: ${neighborhood.length} connections`);

  const human = await proposeHumanConnections(usable).catch(error => {
    console.error(`❌ Human matching failed: ${error.message}`);
    return [];
  });
  console.log(`🔗 Human extras: ${human.length} connections`);

  const connections = mergeConnections([neighborhood, human]);
  console.log(`🔗 ${connections.length} connections total`);
  return connections;
}

/**
 * Connect a newly researched book: same-genre neighborhood plus human extras.
 */
async function proposeConnectionsForNewBook(newBook, existingBooks) {
  const others = existingBooks.filter(book => book.id !== newBook.id);
  if (others.length === 0) return [];

  const catalog = [newBook, ...others];
  const vectors = await embedTexts(catalog.map(embeddingText));
  const neighborhood = sameGenreNeighborhood(catalog, vectors, { onlyFromId: newBook.id });
  const human = await proposeHumanConnections(catalog, { onlyFromId: newBook.id }).catch(error => {
    console.error(`❌ Human matching failed: ${error.message}`);
    return [];
  });
  return mergeConnections([neighborhood, human]);
}

module.exports = {
  MODEL,
  CATEGORIES,
  compactProfile,
  researchBook,
  researchBooks,
  proposeConnections,
  proposeConnectionsForNewBook
};
