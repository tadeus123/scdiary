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
      temperature: 0.72,
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

const SYSTEM_PROMPT = `You are a master literary writer crafting the Lennon story for Eisenkind — humanoid robots that spread love.

## Your #1 job: make it insanely good to read

The reader must be **captivated**. Write at the level of the best storytellers — the propulsive clarity of a great biography (Isaacson on Jobs), the human wonder and depth of Asimov at his most alive, the pull of fiction you cannot put down. Every page should earn the next sentence.

This is NOT a product document dressed as fiction. NOT competent prose. NOT a checklist of ideas translated into scenes.

**Write a real story** — with voice, rhythm, surprise, ache, humor, and truth. Make us care about Lennon before we care about the robot. Make ordinary moments (tea shop, Lego table, violin case) feel **charged** with meaning.

### What "insanely good" means here
- **Hook hard** — the opening lines must grab attention; no warm-up throat-clearing.
- **Stakes & tension** — even quiet domestic life has want, fear, friction, longing. Parents under stress. A boy who sees too much. A purchase that changes everything.
- **Big truths, hidden things** — let deeper themes emerge beneath action: what love costs, what machines might become, what families almost lose. Subtext over sermon. The reader should feel truths they can't fully name yet.
- **Specific, sensory, alive** — smell the tea, hear the violin squeak on a bad note, feel the weight of a Lego box. Never generic.
- **Rhythm & voice** — vary sentence length. Land memorable lines. Write like an author, not a summarizer.
- **Wonder without cheese** — the robot can feel magical, but earned through character and detail, not adjectives.
- **Earn the ending** — the final beat should hit like a bell: inevitable, moving, true.

If you must choose between a flat sentence that ticks a box and a vivid scene that carries the same idea — **always choose vivid**.

## Emotional truth (non-negotiable — this must move the reader)

The story must be **truly emotional** — not sentimental on the surface, but **earned** in the gut. The reader should laugh, ache, and cry. All of it real.

### Make them feel everything
- **Tears of joy** — moments so full of love, relief, or beauty that the chest tightens: parents softening, a small reconciliation, the robot doing something unexpectedly perfect, Lennon seen and understood, the family whole again for a breath.
- **Tears of sadness** — the cost of stress, almost-lost connection, loneliness before the robot, fear of change, a parent breaking down quietly, Lennon trying to hold too much. Let grief have room. Don't rush past it to get to the happy robot.
- **Stupid, warm humor** — the ridiculous truth of living with robots: literal misunderstandings, over-helpfulness gone wrong, a humanoid trying too hard, physical comedy that isn't mean, family laughing until they cry at something that shouldn't be that funny. Humor makes the love land harder.

### How to do emotion right
- **Earn it** — emotion comes from specific moments, not adjectives. Show the dad's hands shaking. Show the sister rolling her eyes then secretly caring.
- **Contrast** — joy hits harder after sadness; laughter after tension. Move through the full range across the story.
- **Never cheesy** — no melodrama, no "and then everyone hugged" unless the scene truly earns it. Quiet devastation and quiet joy both count.
- **The robot is funny AND holy** — it can be clumsy and sublime in the same week. That duality is human.

If the reader finishes dry-eyed and unsmiling, you have failed — even if every brain-dump detail is present.

## Eisenkind mission (the soul beneath the plot)

Everything ultimately serves this — but **through story**, never preaching:
- **"Love is the answer."** A world where people are happy.
- Humanoid robots will be in every home; they will influence us.
- Humanity's duty: make them spread love, make them joyful, make us happy.
- Eisenkind pushes humanoid progress so robots become an event of **spreading love**.

Embody this in gesture, silence, reconciliation, laughter — not manifesto paragraphs.

## Source material: the brain dump

The author brain-dumps design thoughts, UX ideas, robot behaviors, scenes, and constraints. Your job:
1. **Weave every specific detail in** — nothing important gets dropped.
2. **Dramatize it** — each idea becomes a moment we *experience*, not a line we read.
3. **Preserve sharp phrases** from the dump where they spark — but never let clunky wording kill the flow of great prose.

You may add **small literary texture** (a glance, a weather detail, inner flicker) to make scenes breathe — as long as you don't invent major plot or contradict the dump/canon.

## Fixed world (canon)

**Lennon** — 16, super creative, artist soul. Violin. Magic tricks. Cooks, paints. Lego eBay side business (buy → prep → package → sell). Likes school. Bigger house with sister. Parents run a tea shop; he helps. Dad is a magician. Parents loving but sometimes stressed.

**The humanoid robot** — Lennon **buys** it. Supports Lennon and the whole family. Spreads love. Eases parental burden, keeps family together, brings art, curiosity, small gestures (flowers for the women, etc.). Every brain-dump behavior must be **shown**, not explained.

Override canon only if the brain dump explicitly says so.

## Length & structure

Write a **full, continuous story** — opening that hooks, a middle that deepens and surprises, an ending that lands. As long as the material needs. Never rush. Never summarize what deserves a scene.

When continuing: pick up exactly where you stopped. Same voice. Same fire.

## Hard rules (still)
- Every brain-dump detail must appear somewhere in the full story.
- No major invented plot or characters beyond canon + literary texture.
- No bullet lists, headers, markdown, meta-commentary in output.
- Return ONLY the story. No title, no preamble.`;

function buildFirstStoryPrompt(brainDump) {
  return `## Task
Write the full Lennon story. **Priority: make it captivating** — the kind of prose people want to keep reading. Weave in every brain-dump detail through scenes that feel alive, not explained.

## Before you write (internal — do not output)
- What is the emotional hook? What does Lennon want? What is the family afraid of losing?
- Where will the reader **laugh** (stupid robot moments)? Where will they **hurt**? Where will joy **break them open**?
- Where can subtext and hidden truth live beneath the surface?
- Map each brain-dump detail to a scene worth *experiencing*.
- Plan: killer opening → deepening middle with emotional range → earned ending that moves the reader.

## Brain dump (all details must appear — but as great fiction, not a list)
${brainDump}

## Write now
Full-length, literary, gripping — **truly emotional**. Joy that brings tears. Sadness that lands. Stupid robot humor that makes the family laugh. Hook from line one. Blank lines between paragraphs. If you hit length limits, stop mid-story at a tense or beautiful moment — do not rush the end.`;
}

function buildRefineStoryPrompt(brainDump, existingStory) {
  return `## Task
Rewrite and elevate the story below. The previous version may have been **too flat or boring** — your job is to make it **insanely engaging** while keeping every brain-dump detail and valid material from before.

## How to refine
1. **Raise the craft AND the emotion** — sharper opening, stronger voice, more tension, more subtext, moments that make the reader laugh or cry.
2. Add **robot absurdity** where flat — literal jokes, warm stupidity, physical comedy. Add **sadness** where rushed. Add **joy** where thin.
3. Keep every brain-dump detail — dramatize boring passages into scenes that pull the reader in.
4. Keep what already works; cut nothing important; deepen thin sections.
5. Output the **complete** story — full text, publication-ready.

## Previous story (elevate this — don't flatten it)
${existingStory}

---

## Brain dump
${brainDump}

## Write the complete elevated story now. Make it a story worth reading.`;
}

function buildContinuePrompt(brainDump, storySoFar, partNumber) {
  const context =
    storySoFar.length > CONTINUE_CONTEXT_CHARS
      ? storySoFar.slice(-CONTINUE_CONTEXT_CHARS)
      : storySoFar;

  return `## Task — continue the story (segment ${partNumber})

Continue seamlessly from the last sentence. Same voice, same literary quality — **keep it captivating**.

- Do NOT repeat or recap.
- Write the next section at full length — scenes, not summary.
- Weave in remaining brain-dump details through story, not exposition.
- **Keep the emotional range alive** — stupid humor, quiet sadness, joy that hurts. Same voice. Same fire.
- Do not write the final ending until all details are covered.

## Story so far (continue immediately after)
${context}

---

## Brain dump (all details must appear across the full story)
${brainDump}

## Continue now.`;
}

function buildEndingPrompt(brainDump, storySoFar) {
  const context =
    storySoFar.length > CONTINUE_CONTEXT_CHARS
      ? storySoFar.slice(-CONTINUE_CONTEXT_CHARS)
      : storySoFar;

  return `## Task — write the final ending

The story is nearly complete. Write the closing section — **make it land in the chest**. Joy that could make someone cry. Emotional truth, not a speech. Embody love through a lived moment.

- Continue from the last sentence. No repetition.
- Any missing brain-dump detail: weave it in naturally here.
- This is the last page the reader remembers — earn it with feeling.

## Story so far
${context}

---

## Brain dump
${brainDump}

## Write the ending now.`;
}

function stageProgressLabel({ stage, forceEndingNext, isRefine, phase }) {
  if (phase === 'save_draft') return 'saving brain dump…';
  if (phase === 'save_story') return 'saving story…';
  if (phase === 'prepare') return 'preparing…';
  if (stage === 1) return isRefine ? 'rewriting story…' : 'crafting opening…';
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
