/**
 * AI-Powered Book Research Service
 * Automatically finds audiobook duration and page count from the web
 */

require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Search Google Books API for book information
 */
async function searchGoogleBooks(title, author) {
  try {
    const query = encodeURIComponent(`${title} ${author}`);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${query}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('⚠️  Google Books API returned error:', response.status);
      return { pageCount: null };
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      const pageCount = book.pageCount || null;
      console.log(`📚 Google Books found ${pageCount} pages`);
      return { pageCount };
    }
    
    return { pageCount: null };
  } catch (error) {
    console.warn('⚠️  Google Books search failed:', error.message);
    return { pageCount: null };
  }
}

/**
 * Use AI to analyze and find audiobook/book info
 */
async function searchAudiobookWithAI(title, author) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured.');
    return { audioDuration: null, pageCount: null };
  }

  try {
    console.log(`🔍 AI searching for audiobook/book info...`);
    
    const prompt = `I need EXACT information about this book:

Title: "${title}"
Author: ${author}

Please provide:
1. AUDIOBOOK DURATION in minutes (if it exists on Audible, Google Play Books, etc.) - THIS IS PRIORITY #1
2. PAGE COUNT (from the most common edition)

Return ONLY a JSON object (no other text or markdown):
{
  "audioDurationMinutes": <number or null>,
  "pageCount": <number or null>,
  "confidence": "<high/medium/low>",
  "source": "<platform/edition info>"
}

Rules:
- If audiobook exists, ALWAYS include audioDurationMinutes
- Convert hours to minutes (e.g., 7.5 hours = 450 minutes)
- Return null for values you don't know with high confidence
- Be precise with numbers`;

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
            content: 'You are a book information expert. Always return valid JSON with accurate book data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 256
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return { audioDuration: null, pageCount: null };
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    console.log('🤖 AI Response:', responseText);
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const bookData = JSON.parse(jsonMatch[0]);
      return {
        audioDuration: bookData.audioDurationMinutes || null,
        pageCount: bookData.pageCount || null,
        confidence: bookData.confidence || 'unknown',
        source: bookData.source || 'AI knowledge'
      };
    }
    
    console.warn('⚠️ Could not parse AI response as JSON');
    return { audioDuration: null, pageCount: null };
    
  } catch (error) {
    console.error('❌ AI search failed:', error.message);
    return { audioDuration: null, pageCount: null };
  }
}

/**
 * Research book information from the web
 * Priority: Audiobook duration (most accurate) -> Page count (fallback)
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @returns {Promise<{audioDuration: number|null, pageCount: number|null}>}
 */
async function researchBookInfo(title, author) {
  try {
    console.log(`\n🔍 Researching book info for "${title}" by ${author}...`);
    
    // Step 1: Try to find audiobook duration using AI (priority!)
    const audioInfo = await searchAudiobookWithAI(title, author);
    
    let finalAudioDuration = audioInfo.audioDuration;
    let finalPageCount = audioInfo.pageCount;
    
    // Step 2: If no page count yet, try Google Books API
    if (!finalPageCount) {
      const googleInfo = await searchGoogleBooks(title, author);
      finalPageCount = googleInfo.pageCount;
    }
    
    console.log(`✅ Research complete:`);
    console.log(`   - Audio Duration: ${finalAudioDuration ? finalAudioDuration + ' min' : 'Not found'}`);
    console.log(`   - Page Count: ${finalPageCount || 'Not found'}`);
    console.log(`   - Confidence: ${audioInfo.confidence || 'N/A'}`);
    console.log(`   - Source: ${audioInfo.source || 'N/A'}\n`);
    
    return {
      audioDuration: finalAudioDuration,
      pageCount: finalPageCount
    };
    
  } catch (error) {
    console.error('❌ Error researching book info:', error.message);
    // Return nulls so the book can still be added
    return { audioDuration: null, pageCount: null };
  }
}

module.exports = {
  researchBookInfo
};
