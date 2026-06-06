require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/** Best-first chain; env override is tried first, then fallbacks. */
const EISENKIND_MODEL_CHAIN = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini'];

const OUTPUT_TOKEN_FLOOR = 2048;
const OUTPUT_TOKEN_CEILING = 8192;
const TPM_BUDGET_TOKENS = 28000;
const MAX_STORY_STAGES = 6;
const CONTINUE_CONTEXT_CHARS = 14000;

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function trimTextToTokenBudget(text, tokenBudget) {
  const trimmed = (text || '').trim();
  const maxChars = Math.max(800, tokenBudget * 4);
  if (trimmed.length <= maxChars) return trimmed;

  const headChars = Math.floor(maxChars * 0.45);
  const tailChars = Math.floor(maxChars * 0.45);
  return `${trimmed.slice(0, headChars)}

[…middle omitted to fit API limits — merge themes from both parts…]

${trimmed.slice(-tailChars)}`;
}

function fitPromptToBudget({ brainDump, existingStory }) {
  const systemTokens = estimateTokens(SYSTEM_PROMPT);
  const templateOverhead = 800;
  const outputReserve = OUTPUT_TOKEN_CEILING;
  let budget = TPM_BUDGET_TOKENS - systemTokens - templateOverhead - outputReserve;

  let dump = (brainDump || '').trim();
  let story = (existingStory || '').trim();
  let trimmed = false;

  if (estimateTokens(dump) + estimateTokens(story) <= budget) {
    return { brainDump: dump, existingStory: story, trimmed };
  }

  if (story) {
    const dumpTokens = estimateTokens(dump);
    if (dumpTokens < budget) {
      story = trimTextToTokenBudget(story, budget - dumpTokens);
      trimmed = true;
      return { brainDump: dump, existingStory: story, trimmed };
    }
  }

  dump = trimTextToTokenBudget(dump, Math.floor(budget * 0.72));
  story = story ? trimTextToTokenBudget(story, Math.floor(budget * 0.22)) : '';
  trimmed = true;
  return { brainDump: dump, existingStory: story, trimmed };
}

function computeMaxOutputTokens(messages) {
  const inputTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const available = TPM_BUDGET_TOKENS - inputTokens - 300;
  return Math.min(OUTPUT_TOKEN_CEILING, Math.max(OUTPUT_TOKEN_FLOOR, available));
}

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

function isRequestTooLarge(status, errorData) {
  const code = errorData?.error?.code || '';
  const message = (errorData?.error?.message || '').toLowerCase();

  if (code === 'rate_limit_exceeded' || code === 'context_length_exceeded') return true;
  if (status === 429) return true;
  return (
    /too large/.test(message) ||
    /tokens per min/.test(message) ||
    /tpm/.test(message) ||
    /context length/.test(message) ||
    /maximum context/.test(message)
  );
}

function mergeStoryContinuation(existing, continuation) {
  const base = (existing || '').trimEnd();
  const next = (continuation || '').trim();

  if (!next) return base;
  if (!base) return next;

  if (next.startsWith(base.slice(-Math.min(200, base.length)))) {
    return next;
  }

  return `${base}\n\n${next}`;
}

function shouldContinueWriting({ finishReason, story, brainDump, stage, forceEndingNext }) {
  if (stage >= MAX_STORY_STAGES) return false;
  if (forceEndingNext) return false;
  if (finishReason === 'length') return true;

  const dumpLen = (brainDump || '').length;
  const storyLen = (story || '').length;

  if (dumpLen > 1200 && storyLen < dumpLen * 1.2 && stage < 3) return true;
  if (dumpLen > 3000 && storyLen < dumpLen * 1.8 && stage < 4) return true;

  return false;
}

function needsFinalEnding(story) {
  const text = (story || '').trim();
  if (text.length < 800) return true;
  const tail = text.slice(-1200).toLowerCase();
  return !/(finally|at last|that evening|that night|years later|the end|went to bed|goodnight|good night|held each other|together again|love is|happier|at peace)/.test(
    tail
  );
}

async function requestStoryFromModel(model, messages, maxTokens) {
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
      max_tokens: maxTokens
    })
  });

  const errorData = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = errorData?.error?.message || `OpenAI API error (${response.status})`;
    return { ok: false, status: response.status, errorData, error: message };
  }

  const choice = errorData.choices?.[0];
  const story = (choice?.message?.content || '').trim();
  if (!story) {
    return { ok: false, status: response.status, errorData, error: 'OpenAI returned an empty story.' };
  }

  return {
    ok: true,
    story,
    model,
    finishReason: choice?.finish_reason || 'stop'
  };
}

async function completeEisenkindStoryCall(messages) {
  const models = getEisenkindModelChain();
  const maxTokens = computeMaxOutputTokens(messages);
  const tokenTiers = [maxTokens, Math.max(OUTPUT_TOKEN_FLOOR, Math.floor(maxTokens / 2))];
  let lastError = 'No OpenAI models available for Eisenkind story generation.';

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];

    for (let tierIndex = 0; tierIndex < tokenTiers.length; tierIndex += 1) {
      const tokens = tokenTiers[tierIndex];
      const result = await requestStoryFromModel(model, messages, tokens);

      if (result.ok) {
        return {
          success: true,
          story: result.story,
          model: result.model,
          finishReason: result.finishReason,
          maxTokens: tokens
        };
      }

      lastError = result.error;
      const hasLowerTier = tierIndex < tokenTiers.length - 1;
      const hasNextModel = modelIndex < models.length - 1;

      if (isRequestTooLarge(result.status, result.errorData)) {
        if (hasLowerTier) continue;
        if (hasNextModel) break;
        lastError =
          'Brain dump too large for OpenAI rate limits. Try again in a minute or shorten the dump slightly.';
        continue;
      }

      if (hasNextModel && isModelUnavailable(result.status, result.errorData)) break;

      return { success: false, error: result.error };
    }
  }

  return { success: false, error: lastError };
}

const SYSTEM_PROMPT = `You work on Eisenkind — a project about humanoid robots that spread love through great user experience.

## Eisenkind mission (thematic north star — everything orbits this)

The Lennon story is a **dramatization** of this higher mission. Every scene, the robot's behavior, and the ending should serve it — shown through life, never as a preachy essay.

The mission (fixed — always the deeper purpose of the story):
- **"Love is the answer."**
- I want a world where people are happy.
- Humanoid robots will inevitably someday be in every home. They will influence us.
- It is the duty of humanity to make them spread love. To make them joyful. To make us happy.
- Eisenkind tries to contribute as much as possible to the progress of humanoid robots — so that humanoids become a big event of **spreading love**.

The story must make the reader **feel** this mission through Lennon's family and the robot — happiness returning, love in small gestures, joy in daily life, the robot as a force for human flourishing. The ending especially should resonate with this: not a slogan, but a lived moment that proves "love is the answer."

Do not paste the mission as a block of manifesto text. **Embody** it in the narrative.

## What you are doing

The author brain-dumps raw design thoughts, product ideas, UX details, scenes, and constraints into a text field.
Your job is NOT to invent a new story from scratch and NOT to rewrite their ideas in your own words.

Your job IS to:
1. **Sort** — take every distinct thought from the brain dump and place it in the right part of a coherent narrative.
2. **Preserve** — keep every specific detail the author mentioned. Nothing good gets lost, cut, or “smoothed away”.
3. **Functional story** — turn design/UX/product details into a **full functional story**: the reader should *see* each idea working in real life through scenes, not as a list or essay.
4. **Shape for reading** — arrange everything into vivid, descriptive literary prose that is genuinely pleasant to read — but never at the cost of dropping or diluting the author’s material.

Think: **literary organizer**, not creative co-author. You structure and dramatize what is already there.

## Length (critical)

Write a **real, full story** — as long as the brain dump requires. **Never** compress material to be brief. **Never** summarize multiple brain-dump points into one rushed paragraph.
- Expand scenes: let moments breathe, use sensory detail, dialogue where natural.
- Cover the full arc of Lennon’s life with the robot — days, routines, family rhythms — whatever the material needs.
- If you cannot fit everything in one response, stop at a natural mid-story break — **do not** rush an ending early.
- When continuing a story, pick up exactly where it left off.

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
6. **Surgical updates**: When the brain dump grows, do not rewrite the whole story from scratch unless necessary. Find the right scenes and **adjust, extend, or insert** so new details fit naturally.
7. **Design = dramatized**: Product/UX/design notes from the brain dump must become **visible actions, moments, dialogue, or sensory scenes** in Lennon’s daily life with the robot — not a manifesto paragraph.

## Narrative structure (one complete story)

This is NOT a list of disconnected scene snippets, UX examples, or bullet points dressed as prose.
Write **one continuous full story** that a reader can follow from start to finish:

- **Opening** — ground us in Lennon’s world (family, house, his creative life) and lead naturally toward the robot arriving (the purchase / first meeting is a story beat, not a footnote).
- **Middle** — weave brain-dump details through **many connected scenes** that flow in time. Use transitions. Show cause and effect. Let weeks or meaningful stretches of life unfold if needed.
- **Ending** — only when the story is truly ready to close: a clear, satisfying final beat that **embodies the Eisenkind mission** — love spread, people happier, family closer.

Scenes must **connect** — not jump randomly. Every paragraph belongs to the same story.

## Writing quality rules

- Vivid, descriptive literary prose — scenes you can see, hear, smell, feel.
- Good rhythm, specificity, emotional texture.
- Show the robot’s love-spreading through **behavior**, not slogans.
- Paragraph breaks between story beats (blank line between paragraphs).
- English prose. No bullet lists, no headers, no markdown, no meta-commentary.

## Output

Return ONLY the story text. No title, no preamble, no part labels, no “Continued from”, no checklist.`;

function buildFirstStoryPrompt(brainDump) {
  return `## Task
Write the **full** Lennon story from the brain dump below — as long as it needs to be.

## Before you write (internal check — do not output this)
- List every distinct detail in the brain dump.
- Plan a long story arc: opening → many middle scenes → ending — all serving the Eisenkind mission.
- Assign each brain-dump detail to a specific scene (not as standalone snippets).
- Confirm fixed canon is woven in where the brain dump does not override it.

## Brain dump (SOURCE OF TRUTH — every item must appear in the story)
${brainDump}

## Write now
A real, full-length story — rich scenes, not a summary. Do not rush the ending if material remains. If you hit length limits, stop at a natural mid-story moment. Use blank lines between paragraphs. Preserve the author's wording where it is already strong.`;
}

function buildRefineStoryPrompt(brainDump, existingStory) {
  return `## Task
Refine and **expand** the existing story. New and old brain-dump material must ALL be in the final story. Make it longer and richer where details were thin.

## How to refine (follow exactly)
1. Keep every valid detail from the PREVIOUS STORY — do not cut good passages.
2. Read the full BRAIN DUMP. Identify anything missing or under-dramatized.
3. Integrate missing material by extending scenes — more depth, more moments, not one-line mentions.
4. Preserve the author's distinctive phrases from the brain dump verbatim where possible.
5. Output the **complete updated story** — full text, ready to publish.
6. One connected story with opening, flowing middle, and a proper ending.

## Previous story
${existingStory}

---

## Brain dump (SOURCE OF TRUTH)
${brainDump}

## Write the complete updated story now — as long as it needs to be.`;
}

function buildContinuePrompt(brainDump, storySoFar, partNumber) {
  const context =
    storySoFar.length > CONTINUE_CONTEXT_CHARS
      ? storySoFar.slice(-CONTINUE_CONTEXT_CHARS)
      : storySoFar;

  return `## Task — continue the Lennon story (segment ${partNumber})

The story was interrupted by output length. Continue **immediately** from the last sentence below.
- Do NOT repeat text already written.
- Do NOT restart from the beginning.
- Write the **next** section at full length — rich scenes, not summary.
- Cover brain-dump details not yet dramatized.
- Do NOT write the final ending until all brain-dump details are covered — unless this segment completes the last missing details.

## Story so far (continue right after this)
${context}

---

## Brain dump (SOURCE OF TRUTH — all details must appear across the full story)
${brainDump}

## Continue the story now.`;
}

function buildEndingPrompt(brainDump, storySoFar) {
  const context =
    storySoFar.length > CONTINUE_CONTEXT_CHARS
      ? storySoFar.slice(-CONTINUE_CONTEXT_CHARS)
      : storySoFar;

  return `## Task — write the story's **final ending**

The story below is nearly complete. Write the closing section only:
- Continue seamlessly from the last sentence.
- Do NOT repeat earlier paragraphs.
- Land a proper ending that embodies the Eisenkind mission (love, happiness, family together).
- Ensure any brain-dump detail still missing appears in this closing section.

## Story so far
${context}

---

## Brain dump (SOURCE OF TRUTH)
${brainDump}

## Write the ending section now.`;
}

function stageProgressLabel({ stage, forceEndingNext, isRefine, phase }) {
  if (phase === 'save_draft') return 'saving brain dump…';
  if (phase === 'save_story') return 'saving story…';
  if (phase === 'prepare') return 'preparing…';
  if (stage === 1) return isRefine ? 'rewriting story…' : 'writing opening…';
  if (forceEndingNext) return 'writing ending…';
  return `writing part ${stage}…`;
}

function stageProgressPercent({ phase, stage, maxStages, stageComplete }) {
  if (phase === 'prepare') return 2;
  if (phase === 'save_draft') return 5;
  if (phase === 'save_story') return 96;
  if (phase === 'complete') return 100;

  const base = 8;
  const span = 84;
  const ratio = stageComplete ? stage / maxStages : (stage - 1) / maxStages + 0.08;
  return Math.min(94, Math.round(base + ratio * span));
}

async function generateStoryInStages(brainDump, existingStory, onProgress) {
  let story = '';
  let modelUsed = null;
  let stage = 1;
  let forceEndingNext = false;
  const startedAt = Date.now();
  const isRefine = Boolean(existingStory);

  const report = (payload) => {
    if (!onProgress) return;
    onProgress({
      ...payload,
      elapsedMs: Date.now() - startedAt,
      maxStages: MAX_STORY_STAGES,
      percent: stageProgressPercent(payload)
    });
  };

  report({ phase: 'prepare', stage: 1, stageComplete: false, label: stageProgressLabel({ phase: 'prepare', stage: 1 }) });

  while (stage <= MAX_STORY_STAGES) {
    let userPrompt;

    if (stage === 1) {
      userPrompt = isRefine
        ? buildRefineStoryPrompt(brainDump, existingStory)
        : buildFirstStoryPrompt(brainDump);
    } else if (forceEndingNext) {
      userPrompt = buildEndingPrompt(brainDump, story);
    } else {
      userPrompt = buildContinuePrompt(brainDump, story, stage);
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const stageLabel = stageProgressLabel({ stage, forceEndingNext, isRefine, phase: 'writing' });
    report({ phase: 'writing', stage, stageComplete: false, label: stageLabel });

    console.log(`📝 Eisenkind story stage ${stage}/${MAX_STORY_STAGES}…`);
    const result = await completeEisenkindStoryCall(messages);

    if (!result.success) {
      return result;
    }

    story = stage === 1 ? result.story : mergeStoryContinuation(story, result.story);
    modelUsed = result.model;

    console.log(
      `   stage ${stage}: +${result.story.length} chars (total ${story.length}), finish=${result.finishReason}, max_tokens=${result.maxTokens}`
    );

    report({
      phase: 'writing',
      stage,
      stageComplete: true,
      label: stageLabel,
      storyChars: story.length
    });

    const shouldContinue = shouldContinueWriting({
      finishReason: result.finishReason,
      story,
      brainDump,
      stage,
      forceEndingNext
    });

    if (shouldContinue) {
      stage += 1;
      continue;
    }

    if (!forceEndingNext && needsFinalEnding(story) && stage < MAX_STORY_STAGES) {
      forceEndingNext = true;
      stage += 1;
      continue;
    }

    break;
  }

  console.log(`✅ Eisenkind story complete (${story.length} chars, ${stage} stage(s), ${modelUsed})`);
  return { success: true, story, model: modelUsed, stages: stage };
}

async function generateEisenkindStory({ brainDump, existingStory, onProgress }) {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'OpenAI API key not configured. Set OPENAI_API_KEY.' };
  }

  const trimmedDump = (brainDump || '').trim();
  if (!trimmedDump) {
    return { success: false, error: 'Brain dump is empty. Add some notes first.' };
  }

  const fitted = fitPromptToBudget({
    brainDump: trimmedDump,
    existingStory: (existingStory || '').trim()
  });

  if (fitted.trimmed) {
    console.warn('⚠️ Eisenkind prompt trimmed to fit OpenAI token limits');
  }

  try {
    return await generateStoryInStages(fitted.brainDump, fitted.existingStory, onProgress);
  } catch (error) {
    console.error('Eisenkind story generation failed:', error);
    return { success: false, error: error.message || 'Story generation failed.' };
  }
}

module.exports = { generateEisenkindStory };
