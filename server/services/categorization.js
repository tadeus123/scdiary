require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Category priority (Biography > Technology > Business > etc.)
const CATEGORY_PRIORITY = [
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

/**
 * Categorize a book using OpenAI API
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @returns {Promise<string>} Category name
 */
async function categorizeBook(title, author) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured. Returning "Other" category.');
    return 'Other';
  }

  try {
    const prompt = `You are a book categorization expert. Categorize the following book into exactly ONE of these categories, choosing the MOST SPECIFIC and PRIMARY category that fits best.

Category Priority (choose highest priority that applies):
1. Biography - biographies, autobiographies, memoirs about a person's life
2. Technology - computers, AI, AR/VR, blockchain, programming, engineering
3. Business - entrepreneurship, startups, management, companies, business strategy
4. Finance - investing, economics, money, wealth, financial markets
5. Philosophy - philosophical works, ethics, metaphysics, epistemology
6. Science Fiction - sci-fi novels and stories
7. Science - physics, biology, chemistry, astronomy, scientific research
8. Design - design thinking, UX/UI, product design, creative design
9. Self-Help - personal development, habits, productivity, motivation
10. History - historical events, periods, civilizations
11. Politics - political theory, governance, political figures
12. Other - anything else

Book Information:
Title: "${title}"
Author: "${author}"

Rules:
- If it's a biography/autobiography, ALWAYS choose "Biography" (highest priority)
- If it's about technology AND a person, choose "Biography"
- If it's about business AND a person, choose "Biography"
- Choose the single most appropriate category
- Respond with ONLY the category name, nothing else

Category:`;

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
            content: 'You are a precise book categorization system. Always respond with exactly one category name.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 20
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return 'Other';
    }

    const data = await response.json();
    const category = data.choices[0].message.content.trim();
    
    // Validate category is in our list
    if (CATEGORY_PRIORITY.includes(category)) {
      console.log(`✅ Categorized "${title}" as: ${category}`);
      return category;
    } else {
      console.warn(`⚠️ Unknown category "${category}" for "${title}", using "Other"`);
      return 'Other';
    }

  } catch (error) {
    console.error('Error categorizing book:', error.message);
    return 'Other';
  }
}

/**
 * Batch categorize multiple books
 * @param {Array} books - Array of {id, title, author} objects
 * @returns {Promise<Array>} Array of {id, category} objects
 */
async function categorizeBooksAI(books) {
  const results = [];
  
  for (const book of books) {
    const category = await categorizeBook(book.title, book.author);
    results.push({
      id: book.id,
      title: book.title,
      author: book.author,
      category: category
    });
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
}

module.exports = {
  categorizeBook,
  categorizeBooksAI,
  CATEGORY_PRIORITY
};
