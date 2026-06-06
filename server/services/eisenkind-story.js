require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_EISENKIND_MODEL || 'gpt-4o';

const LENNON_CANON = `Fixed world (always true unless the brain dump explicitly overrides):
- Lennon is 16, super creative, an artist at heart.
- He plays violin, does magic tricks, loves cooking and painting.
- He runs a small side business: buys Lego, prepares and packages it, sells it on eBay.
- He lives with his family in a bigger house. He has a sister.
- He goes to school and genuinely likes it.
- His parents run a tea shop; Lennon helps there sometimes.
- His dad is a magician. The parents are loving but sometimes stressed.
- Lennon buys his first humanoid robot. It supports Lennon and the whole family.
- The robot spreads love, eases parental stress, keeps the family together, takes on work,
  brings art and curiosity into the home, and does small loving gestures (e.g. flowers for the women).`;

const SYSTEM_PROMPT = `You are a literary editor for Eisenkind, a project about humanoid robots that spread love.

Your job: turn raw brain-dump notes into a vivid, readable short story starring Lennon and his humanoid robot.

${LENNON_CANON}

Rules you must follow:
1. Every specific detail, idea, constraint, or design note in the brain dump MUST appear in the story. Do not drop them.
2. Do not invent major facts, characters, or plot beats that are not grounded in the brain dump or the fixed world above.
3. Do not oversimplify, sanitize, or flatten the author's intent.
4. Preserve distinctive wording from the brain dump where possible — weave phrases in naturally rather than replacing them with generic prose.
5. Write descriptively and vividly, like good literary short fiction — show scenes, sensory detail, emotional texture.
6. When a previous story exists, refine and extend it: integrate new brain-dump material by editing the relevant passages. Keep what still applies. Do not discard established details unless the brain dump clearly replaces them.
7. Output ONLY the story text. No titles, preambles, or markdown. Use blank lines between paragraphs.`;

async function generateEisenkindStory({ brainDump, existingStory }) {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' };
  }

  const trimmedDump = (brainDump || '').trim();
  if (!trimmedDump) {
    return { success: false, error: 'Brain dump is empty. Add some notes first.' };
  }

  const previousStory = (existingStory || '').trim();
  const userPrompt = previousStory
    ? `PREVIOUS STORY (refine this — keep all details that still apply, weave in new material):

${previousStory}

---

BRAIN DUMP (source of truth — every specific detail must end up in the story):

${trimmedDump}

Write the complete updated story.`
    : `BRAIN DUMP (source of truth — every specific detail must end up in the story):

${trimmedDump}

Write the complete story from scratch.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.65,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error?.message || `OpenAI API error (${response.status})`;
      console.error('Eisenkind story generation error:', message);
      return { success: false, error: message };
    }

    const data = await response.json();
    const story = (data.choices?.[0]?.message?.content || '').trim();

    if (!story) {
      return { success: false, error: 'OpenAI returned an empty story.' };
    }

    return { success: true, story };
  } catch (error) {
    console.error('Eisenkind story generation failed:', error);
    return { success: false, error: error.message || 'Story generation failed.' };
  }
}

module.exports = { generateEisenkindStory };
