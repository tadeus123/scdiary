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

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || response.statusText;
    throw new Error(`OpenAI API error: ${message}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const parsed = parseJson(content);
  if (!parsed) {
    throw new Error('Could not parse model JSON');
  }
  return parsed;
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
  const lines = [
    `[${index}] "${book.title}" by ${book.author}`
  ];
  if (profile.about) lines.push(`About: ${profile.about}`);
  if (profile.subjects?.length) lines.push(`Subjects: ${profile.subjects.join(', ')}`);
  if (profile.people?.length) lines.push(`People/orgs: ${profile.people.join(', ')}`);
  if (profile.ideas?.length) lines.push(`Ideas: ${profile.ideas.join('; ')}`);
  if (profile.world) lines.push(`World: ${profile.world}`);
  return lines.join('\n');
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

function extractConnections(parsed, books, { onlyFromId } = {}) {
  const list = Array.isArray(parsed.connections) ? parsed.connections : [];
  const byIndex = new Map(books.map((book, i) => [i + 1, book]));
  const seen = new Set();
  const connections = [];

  for (const item of list) {
    const a = Number(item.a);
    const b = Number(item.b);
    const bookA = byIndex.get(a);
    const bookB = byIndex.get(b);
    if (!bookA || !bookB || bookA.id === bookB.id) continue;

    if (onlyFromId && bookA.id !== onlyFromId && bookB.id !== onlyFromId) continue;

    const [fromId, toId] = [bookA.id, bookB.id].sort();
    const key = `${fromId}|${toId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    connections.push({
      from_book_id: fromId,
      to_book_id: toId,
      reason: String(item.reason || '').trim().slice(0, 240)
    });
  }

  return connections;
}

const MATCHING_RULES = `You are connecting books in a personal intellectual library.

A connection means these two books belong together for a reader of this shelf — they are about the same specific thing, person, company, program, argument, or lineage.

CONNECT when:
- Same person, company, program, or event (Jobs + Apple history; Kelly Johnson + Skunk Works)
- Same specific subject from different angles (space settlement; humanoid robots; AI risk)
- Direct intellectual lineage (a book continues, challenges, or is source material for another)
- Same series or the same fictional world
- Fiction and nonfiction that are actually about the same specific subject

DO NOT CONNECT when:
- They only share a genre or shelf category ("both biographies", "both sci-fi", "both business")
- The link is vague mood or theme ("ambition", "innovation", "the future", "leadership")
- You would only group them because they are "kind of similar"
- The overlap is only that both are famous, both are nonfiction, or both are about "technology"

Be sparse. Most books should have a few real links, not a web to everything nearby. Some books may have none. Hub books (a central Apple history, a core space-settlement text) may have more.

Cross-category links are expected and often the correct ones.`;

/**
 * Propose connections from independently researched profiles.
 * Matching is global — not restricted to category.
 */
async function proposeConnections(books) {
  const usable = books.filter(book => book?.id && book?.title);
  if (usable.length < 2) return [];

  const catalog = usable.map((book, i) => formatBookForPrompt(book, i + 1)).join('\n\n');

  const parsed = await chatJson({
    system: MATCHING_RULES + ' Respond with JSON only.',
    user: `Here is the full library. Each book was researched on its own. Decide which pairs should be connected.

${catalog}

Return JSON:
{
  "connections": [
    { "a": 1, "b": 4, "reason": "short specific reason, not a genre" }
  ]
}

Use the bracket numbers. Each pair once, a < b. Reason must name the shared subject, person, or argument.`,
    maxTokens: 8000,
    temperature: 0.2
  });

  const connections = extractConnections(parsed, usable);
  console.log(`🔗 Matching proposed ${connections.length} connections`);
  return connections;
}

/**
 * Connect one newly researched book to the rest of the library.
 */
async function proposeConnectionsForNewBook(newBook, existingBooks) {
  const others = existingBooks.filter(book => book.id !== newBook.id);
  if (others.length === 0) return [];

  const catalog = [newBook, ...others]
    .map((book, i) => formatBookForPrompt(book, i + 1))
    .join('\n\n');

  const parsed = await chatJson({
    system: MATCHING_RULES + ' Only propose connections that include book [1]. Respond with JSON only.',
    user: `Book [1] is newly added. Connect it only to books it truly belongs with.

${catalog}

Return JSON:
{
  "connections": [
    { "a": 1, "b": 6, "reason": "short specific reason" }
  ]
}

Every connection must include 1. Use bracket numbers. Do not connect [1] to a book just because they share a genre.`,
    maxTokens: 2000,
    temperature: 0.2
  });

  return extractConnections(parsed, [newBook, ...others], { onlyFromId: newBook.id });
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
