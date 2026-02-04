require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Calculate similarity between two books using AI
 * @param {Object} book1 - {title, author, category}
 * @param {Object} book2 - {title, author, category}
 * @returns {Promise<number>} Similarity score 0-10
 */
async function calculateSimilarity(book1, book2) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured');
    return 0;
  }

  // Don't compare a book to itself
  if (book1.id === book2.id) {
    return 0;
  }

  // Books must be in same category to be compared
  if (book1.category !== book2.category) {
    return 0;
  }

  try {
    const prompt = `You are an expert librarian analyzing book relationships. Rate the intellectual similarity between these two books on a scale of 0-10.

Book 1: "${book1.title}" by ${book1.author}
Book 2: "${book2.title}" by ${book2.author}
Category: ${book1.category}

Similarity Scoring Guide:
- 10: Extremely similar (same subject, e.g., two Steve Jobs biographies)
- 8-9: Very similar (same field/topic, e.g., tech entrepreneur biographies)
- 6-7: Related (same domain, e.g., tech industry figures)
- 4-5: Somewhat related (share some themes but different focus)
- 2-3: Loosely related (same category but different eras/fields)
- 0-1: Not related (only share broad category)

Consider:
- Subject matter (are they about the same person/topic?)
- Field/industry (tech, politics, business, science, etc.)
- Time period (contemporary vs historical)
- Themes (innovation, leadership, disruption, etc.)
- Writing approach (autobiography vs biography, analytical vs narrative)

Response format: Return ONLY a single number from 0-10, nothing else.

Similarity score:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a precise similarity scoring system. Always respond with exactly one number from 0-10.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return 0;
    }

    const data = await response.json();
    const scoreText = data.choices[0].message.content.trim();
    const score = parseFloat(scoreText);
    
    if (isNaN(score) || score < 0 || score > 10) {
      console.warn(`⚠️ Invalid score "${scoreText}" for "${book1.title}" vs "${book2.title}"`);
      return 0;
    }

    return score;

  } catch (error) {
    console.error(`Error calculating similarity for "${book1.title}" vs "${book2.title}":`, error.message);
    return 0;
  }
}

/**
 * Analyze all books in a category and find similar pairs
 * @param {Array} books - Array of book objects
 * @param {number} threshold - Minimum similarity score (default: 5)
 * @returns {Promise<Array>} Array of {book1_id, book2_id, score}
 */
async function analyzeCategory(books, threshold = 5) {
  const connections = [];
  const total = (books.length * (books.length - 1)) / 2;
  let processed = 0;

  console.log(`📊 Analyzing ${books.length} books (${total} comparisons)...`);

  for (let i = 0; i < books.length; i++) {
    for (let j = i + 1; j < books.length; j++) {
      const book1 = books[i];
      const book2 = books[j];
      
      const score = await calculateSimilarity(book1, book2);
      processed++;

      if (score >= threshold) {
        connections.push({
          from_book_id: book1.id,
          to_book_id: book2.id,
          score: score
        });
        console.log(`✅ [${processed}/${total}] "${book1.title}" ↔ "${book2.title}" (${score}/10)`);
      } else {
        console.log(`⚪ [${processed}/${total}] "${book1.title}" ↔ "${book2.title}" (${score}/10 - skipped)`);
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return connections;
}

/**
 * Analyze all books and create smart connections
 * @param {Array} allBooks - All books with categories
 * @param {number} threshold - Minimum similarity score (default: 5)
 * @returns {Promise<Array>} Array of connection objects
 */
async function analyzeAllBooks(allBooks, threshold = 5) {
  // Group books by category
  const booksByCategory = {};
  allBooks.forEach(book => {
    if (!book.category) return;
    if (!booksByCategory[book.category]) {
      booksByCategory[book.category] = [];
    }
    booksByCategory[book.category].push(book);
  });

  const allConnections = [];

  // Analyze each category
  for (const [category, books] of Object.entries(booksByCategory)) {
    if (books.length < 2) {
      console.log(`⚪ Skipping ${category} (only ${books.length} book)`);
      continue;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`📚 Category: ${category} (${books.length} books)`);
    console.log(`${'='.repeat(60)}\n`);

    const categoryConnections = await analyzeCategory(books, threshold);
    allConnections.push(...categoryConnections);

    console.log(`\n✅ ${category}: Created ${categoryConnections.length} connections\n`);
  }

  return allConnections;
}

module.exports = {
  calculateSimilarity,
  analyzeCategory,
  analyzeAllBooks
};
