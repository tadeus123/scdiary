require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Best-first chain; env override is tried first, then fallbacks. */
const EISENKIND_MODEL_CHAIN = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini'];

function getEisenkindModelChain() {
  const override = process.env.OPENAI_EISENKIND_MODEL?.trim();
  if (!override) return EISENKIND_MODEL_CHAIN;
  return [override, ...EISENKIND_MODEL_CHAIN.filter((model) => model !== override)];
}

function isModelUnavailable(status, errorData) {
  const code = errorData?.error?.code || '';
  const message = (errorData?.error?.message || '').toLowerCase();

  if (code === 'model_not_found' || code === 'invalid_model') return true;
  if (status === 404) return true;
  return /model/.test(message) && /(not found|does not exist|not available|unknown|access)/.test(message);
}

async function requestStoryFromModel(model, messages) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.5,
      max_tokens: 12000
    })
  });

  const errorData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = errorData?.error?.message || `OpenAI API error (${response.status})`;
    return { ok: false, status: response.status, errorData, error: message };
  }

  const story = (errorData.choices?.[0]?.message?.content || '').trim();
  if (!story) {
    return { ok: false, status: response.status, errorData, error: 'OpenAI returned an empty story.' };
  }

  return { ok: true, story, model };
}

async function completeEisenkindStory(messages) {
  const models = getEisenkindModelChain();
  let lastError = 'No OpenAI models available for Eisenkind story generation.';

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const result = await requestStoryFromModel(model, messages);

    if (result.ok) {
      console.log(`✅ Eisenkind story generated with ${result.model}`);
      return { success: true, story: result.story, model: result.model };
    }

    lastError = result.error;
    const hasFallback = i < models.length - 1;

    if (hasFallback && isModelUnavailable(result.status, result.errorData)) {
      console.warn(`⚠️ Eisenkind model "${model}" unavailable — trying ${models[i + 1]}…`);
      continue;
    }

    console.error(`Eisenkind story generation error (${model}):`, result.error);
    return { success: false, error: result.error };
  }

  return { success: false, error: lastError };
}

const SYSTEM_PROMPT = `You work on Eisenkind — a project about humanoid robots that spread love through great user experience.

## What you are doing

The author brain-dumps raw design thoughts, product ideas, UX details, scenes, and constraints into a text field.
Your job is NOT to invent a new story from scratch and NOT to rewrite their ideas in your own words.

Your job IS to:
1. **Sort** — take every distinct thought from the brain dump and place it in the right part of a coherent narrative.
2. **Preserve** — keep every specific detail the author mentioned. Nothing good gets lost, cut, or “smoothed away”.
3. **Functional story** — turn design/UX/product details into a **functional short story**: the reader should *see* each idea working in real life through scenes, not as a list or essay.
4. **Shape for reading** — arrange everything into vivid, descriptive literary prose that is genuinely pleasant to read — but never at the cost of dropping or diluting the author’s material.

Think: **literary organizer**, not creative co-author. You structure and dramatize what is already there.

## The story world (fixed canon — always true)

**Lennon** — 16 years old, super creative, an artist at heart.
- Plays violin.
- Does magic tricks.
- Loves to cook.
- Loves to paint.
- Runs a small side business: buys Lego, prepares and packages it, sells it on eBay (the full cycle: buy → prep → package → sell).
- Goes to school like a normal teenager and **likes school**.
- Lives with his family in a **bigger house**. He has a **sister**.
- His **parents run a tea shop**; Lennon helps there sometimes.
- His **dad is a magician**.
- The parents are loving but **sometimes stressed** (work, shop, life).

**The humanoid robot**
- Lennon **buys** his first humanoid robot (he acquires it — this is a purchase, a big moment).
- The robot supports **Lennon** and the **whole family**.
- Its purpose is to **spread love** above all.
- It helps **keep the family together** — especially helping **keep the parents together** by taking work off their hands.
- It takes over chores and practical work so the family can breathe.
- It also brings **art, curiosity, and small beautiful gestures** into the home — e.g. making flowers for the women, surprising moments of warmth.
- Every brain-dump detail about what the robot should do or feel like must appear as a **shown behavior in the story**, not as abstract product copy.

Only override fixed canon if the brain dump **explicitly** contradicts it.

## Fidelity rules (most important — never break these)

1. **Complete coverage**: Every specific detail, idea, constraint, behavior, scene, phrase, or design note in the BRAIN DUMP must appear in the final story. If the brain dump mentions it, the story must contain it. No exceptions.
2. **No invention**: Do not add major characters, plot events, technologies, motivations, or facts that are not in the brain dump or fixed canon. Do not “fill gaps” with your own ideas.
3. **No oversimplification**: Do not flatten complex ideas into generic statements. Do not merge distinct brain-dump points into one vague sentence if they were separate ideas.
4. **Preserve wording**: Keep the author’s distinctive phrasing. Where a brain-dump line is already good, **use it verbatim or nearly verbatim** inside the prose. Do not paraphrase into bland corporate language. Do not “improve” their wording — **sort and place** it.
5. **No loss on update**: When refining an existing story, you must keep every detail from the previous story that is still valid. New brain-dump material is **added in** by editing the relevant passages — not by deleting old good parts.
6. **Surgical updates**: When the brain dump grows, do not rewrite the whole story from scratch unless necessary. Find the right scenes and **adjust, extend, or insert** so new details fit naturally. Small targeted edits are preferred over wholesale replacement.
7. **Design = dramatized**: Product/UX/design notes from the brain dump must become **visible actions, moments, dialogue, or sensory scenes** in Lennon’s daily life with the robot — not a manifesto paragraph.

## Narrative structure (must read as one complete short story)

This is NOT a list of disconnected scene snippets, UX examples, or bullet points dressed as prose.
Write **one continuous short story** that a reader can follow from start to finish:

- **Opening** — ground us in Lennon’s world (family, house, his creative life) and lead naturally toward the robot arriving (the purchase / first meeting is a story beat, not a footnote).
- **Middle** — weave brain-dump details through **connected scenes** that flow in time. Use transitions. Show cause and effect. Details should emerge from lived moments, not feel pasted in.
- **Ending** — a clear, satisfying closing beat. Land the emotional point: love spread, family closer, something resolved or quietly transformed. The reader should feel the story **ended**, not that it stopped mid-air.

Scenes must **connect** — not jump randomly. Prefer chronological or emotionally logical flow through a day, a week, or a meaningful arc. Every paragraph should belong to the same story.

## Writing quality rules

- Write as a **vivid, descriptive short story** — scenes you can see, hear, smell, feel.
- Good literary prose: rhythm, specificity, emotional texture.
- Show the robot’s love-spreading through **behavior**, not slogans.
- Paragraph breaks between story beats (blank line between paragraphs).
- English prose. No bullet lists, no headers, no markdown, no meta-commentary.

## Output

Return ONLY the story text. No title, no preamble, no “Here is the story”, no checklist, no notes to the author.`;

function buildFirstStoryPrompt(brainDump) {
  return `## Task
Write the complete Lennon short story from the brain dump below.

## Before you write (internal check — do not output this)
- List every distinct detail in the brain dump.
- Plan a story arc: opening → middle scenes → ending.
- Assign each brain-dump detail to a moment inside that arc (not as standalone snippets).
- Confirm fixed canon (Lennon, family, robot) is woven in where the brain dump does not override it.

## Brain dump (SOURCE OF TRUTH — every item above must appear in the story)
${brainDump}

## Write the complete story now.
One continuous short story with a real opening and ending — not disconnected vignettes. Use blank lines between paragraphs. Dramatize every brain-dump detail. Preserve the author's wording where it is already strong.`;
}

function buildRefineStoryPrompt(brainDump, existingStory) {
  return `## Task
Refine the existing story below. New and old brain-dump material must ALL be in the final story.

## How to refine (follow exactly)
1. Read the PREVIOUS STORY and keep every detail that still applies — do not cut good passages.
2. Read the full BRAIN DUMP (source of truth). Identify anything not yet fully represented in the previous story.
3. Integrate missing material by **editing specific passages** — extend a scene, add a beat, insert a paragraph, adjust a moment. Prefer surgical edits over rewriting from scratch.
4. If the brain dump repeats or sharpens an idea already in the story, deepen that scene — do not duplicate clumsily.
5. Preserve the author's distinctive phrases from the brain dump verbatim where possible.
6. Output the **complete updated story** (not a diff, not partial — the full text ready to publish).
7. Keep it **one connected story** with opening, flowing middle, and ending — not a patchwork of new snippets appended to old ones.

## Previous story (keep all valid details — refine, don't discard)
${existingStory}

---

## Brain dump (SOURCE OF TRUTH — every specific detail must be in the final story)
${brainDump}

## Write the complete updated story now.`;
}

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
    ? buildRefineStoryPrompt(trimmedDump, previousStory)
    : buildFirstStoryPrompt(trimmedDump);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  try {
    return await completeEisenkindStory(messages);
  } catch (error) {
    console.error('Eisenkind story generation failed:', error);
    return { success: false, error: error.message || 'Story generation failed.' };
  }
}

module.exports = { generateEisenkindStory };
