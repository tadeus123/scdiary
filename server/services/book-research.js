/**
 * AI-Powered Audiobook Research Service
 * Searches Audible.com ONLY for accurate audiobook durations
 */

require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Use AI to search Audible.com specifically for audiobook duration
 */
async function searchAudiobookWithAI(title, author) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ OpenAI API key not configured.');
    return { audioDuration: null };
  }

  try {
    console.log(`🔍 AI searching Audible.com for audiobook...`);
    
    const prompt = `Search AUDIBLE.COM ONLY for this specific audiobook:

Title: "${title}"
Author: ${author}

CRITICAL INSTRUCTIONS:
1. Go to Audible.com and search for this EXACT book
2. Make sure you find the CORRECT book (match title AND author exactly)
3. Find the "Length" or "Listening Length" on the Audible page
4. Extract ONLY the audiobook duration from Audible.com
5. Convert to total minutes (e.g., "7 hours and 30 minutes" = 450 minutes)

DO NOT:
- Use page counts (IGNORE page counts completely)
- Guess or estimate
- Use data from other sources
- Return data if you're not confident it's the exact right book

Return ONLY this JSON format (no markdown, no extra text):
{
  "audioDurationMinutes": <number or null>,
  "audibleUrl": "<Audible.com URL if found>",
  "confidence": "<high/medium/low>",
  "matchedTitle": "<exact title on Audible>",
  "matchedAuthor": "<exact author on Audible>"
}

IMPORTANT: Only return audioDurationMinutes if you found it on Audible.com and are confident it's the right book. Return null otherwise.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an Audible.com search specialist. You ONLY provide audiobook durations from Audible.com. You verify the book matches exactly before returning data. You never guess or estimate.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.0,
        max_tokens: 300
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return { audioDuration: null };
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content.trim();
    console.log('🤖 AI Response:', responseText);
    
    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const bookData = JSON.parse(jsonMatch[0]);
      
      // Log matching info for verification
      if (bookData.audioDurationMinutes) {
        console.log(`   ✓ Matched on Audible: "${bookData.matchedTitle}" by ${bookData.matchedAuthor}`);
        console.log(`   ✓ Audible URL: ${bookData.audibleUrl || 'N/A'}`);
        console.log(`   ✓ Duration: ${bookData.audioDurationMinutes} minutes`);
        console.log(`   ✓ Confidence: ${bookData.confidence}`);
      }
      
      return {
        audioDuration: bookData.audioDurationMinutes || null,
        confidence: bookData.confidence || 'unknown',
        source: bookData.audibleUrl || 'Audible.com',
        matchedTitle: bookData.matchedTitle,
        matchedAuthor: bookData.matchedAuthor
      };
    }
    
    console.warn('⚠️ Could not parse AI response as JSON');
    return { audioDuration: null };
    
  } catch (error) {
    console.error('❌ AI search failed:', error.message);
    return { audioDuration: null };
  }
}

/**
 * Research audiobook duration from Audible.com ONLY
 * @param {string} title - Book title
 * @param {string} author - Book author
 * @returns {Promise<{audioDuration: number|null}>}
 */
async function researchBookInfo(title, author) {
  try {
    console.log(`\n🔍 Researching AUDIOBOOK on Audible.com for "${title}" by ${author}...`);
    
    // Search ONLY on Audible.com for audiobook duration
    const audioInfo = await searchAudiobookWithAI(title, author);
    
    const finalAudioDuration = audioInfo.audioDuration;
    
    console.log(`✅ Audible.com search complete:`);
    if (finalAudioDuration) {
      console.log(`   ✅ FOUND on Audible: ${finalAudioDuration} minutes`);
      console.log(`   ✅ Matched: "${audioInfo.matchedTitle}" by ${audioInfo.matchedAuthor}`);
      console.log(`   ✅ Confidence: ${audioInfo.confidence}`);
      console.log(`   ✅ Source: ${audioInfo.source}\n`);
    } else {
      console.log(`   ⚠️  NOT FOUND on Audible (will use default 5-hour estimate)`);
      console.log(`   → Book might not exist as audiobook on Audible.com\n`);
    }
    
    return {
      audioDuration: finalAudioDuration
    };
    
  } catch (error) {
    console.error('❌ Error researching book info:', error.message);
    // Return null so the book can still be added (will use default estimate)
    return { audioDuration: null };
  }
}

module.exports = {
  researchBookInfo
};
