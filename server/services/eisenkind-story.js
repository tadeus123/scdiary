require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const EISENKIND_MODEL_CHAIN = ['gpt-4.1', 'gpt-4o', 'gpt-4o-mini'];

const OUTPUT_TOKEN_FLOOR = 2048;
const OUTPUT_TOKEN_CEILING = 8192;
const BEAT_SHEET_MAX_TOKENS = 1200;
const TPM_BUDGET_TOKENS = 28000;
const MAX_STORY_STAGES = 6;
const CONTINUE_CONTEXT_CHARS = 12000;
const OPENING_ANCHOR_CHARS = 3200;

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
  const templateOverhead = 900;
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

function computeMaxOutputTokens(messages, ceiling = OUTPUT_TOKEN_CEILING) {
  const inputTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const available = TPM_BUDGET_TOKENS - inputTokens - 300;
  return Math.min(ceiling, Math.max(OUTPUT_TOKEN_FLOOR, available));
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

function buildStoryContextForContinue(storySoFar) {
  const text = (storySoFar || '').trim();
  if (text.length <= CONTINUE_CONTEXT_CHARS) return text;

  const opening = text.slice(0, OPENING_ANCHOR_CHARS).trimEnd();
  const recent = text.slice(-(CONTINUE_CONTEXT_CHARS - OPENING_ANCHOR_CHARS - 80)).trimStart();
  return `${opening}\n\n[…story continues…]\n\n${recent}`;
}

function shouldContinueWriting({ finishReason, story, brainDump, stage, forceEndingNext }) {
  if (stage >= MAX_STORY_STAGES) return false;
  if (forceEndingNext) return false;
  if (finishReason === 'length') return true;

  const dumpLen = (brainDump || '').length;
  const storyLen = (story || '').length;

  if (dumpLen > 800 && storyLen < Math.max(3500, dumpLen * 1.4) && stage < 4) return true;
  if (dumpLen > 2500 && storyLen < dumpLen * 2 && stage < 5) return true;

  return false;
}

function storyLikelyNeedsEnding(story, stage) {
  const text = (story || '').trim();
  if (text.length < 1200) return true;
  if (stage <= 1 && text.length > 2500) return true;

  const tail = text.slice(-900);
  const endsMidAction = /[,—–-]\s*$/.test(tail) || /\b(and|but|when|as|while)\s*$/.test(tail.toLowerCase());
  if (endsMidAction) return true;

  return text.length > 4500 && stage < MAX_STORY_STAGES;
}

async function requestStoryFromModel(model, messages, options = {}) {
  const {
    maxTokens = OUTPUT_TOKEN_CEILING,
    temperature = 0.74,
    frequencyPenalty = 0.12,
    presencePenalty = 0.08
  } = options;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty
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

async function completeEisenkindStoryCall(messages, callOptions = {}) {
  const models = getEisenkindModelChain();
  const maxTokens = computeMaxOutputTokens(messages, callOptions.maxTokensCeiling);
  const tokenTiers = [maxTokens, Math.max(OUTPUT_TOKEN_FLOOR, Math.floor(maxTokens / 2))];
  let lastError = 'No OpenAI models available for Eisenkind story generation.';

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];

    for (let tierIndex = 0; tierIndex < tokenTiers.length; tierIndex += 1) {
      const tokens = tokenTiers[tierIndex];
      const result = await requestStoryFromModel(model, messages, {
        maxTokens: tokens,
        temperature: callOptions.temperature,
        frequencyPenalty: callOptions.frequencyPenalty,
        presencePenalty: callOptions.presencePenalty
      });

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

const SYSTEM_PROMPT = `You write the Lennon story for Eisenkind — fiction so good the reader forgets they're reading "content."

WHEN RULES CONFLICT, obey this order:
1. **Grip** — propulsive, literary, can't-put-down prose (Isaacson clarity + Asimov heart + real emotional truth)
2. **Feeling** — joy that hurts, grief that lingers, warm stupid laughter at robot absurdity
3. **Arc** — one story: hook → deepening life → earned ending
4. **Brain dump** — every author detail appears inside scenes, never as a list
5. **Canon & mission** — shown in gesture, never preached

CRAFT:
- Open mid-motion or mid-feeling. No throat-clearing.
- Scene by scene: want, obstacle, choice, consequence. Let tea shops and Lego tables feel mythic because we care.
- Subtext > explanation. Big truths hide under small actions.
- Concrete senses always. Vary rhythm. Land lines that stick.
- Dialogue sparse but alive when it appears.

EMOTION (required range across the full story):
- Tears of joy (relief, reunion, beauty, being seen)
- Tears of sadness (stress, almost-loss, loneliness, parents breaking)
- Stupid robot humor (literal, over-eager, physical, loving — family laughing until they cry)

CANON: Lennon, 16, artist — violin, magic, cook, paint, Lego eBay (buy/prep/ship/sell), likes school, sister, bigger house, parents' tea shop (dad magician), parents stressed but loving. He **buys** a humanoid robot that supports the family, spreads love, lightens load, makes flowers, brings art and curiosity.

MISSION (embodied only): Love is the answer. Robots in every home must spread joy and love.

NEVER: product copy, feature tours, generic adjectives, melodrama, recap paragraphs, markdown, meta notes.

OUTPUT: Story prose only. Blank line between paragraphs.`;

const BEAT_SHEET_SYSTEM = `You are a story architect. Output a beat sheet ONLY — not the story. Each beat is one vivid line: what happens + what we feel. 10–16 beats. Cover every brain-dump detail. Arc must include: hook, family strain, robot purchase/arrival, comedy, deepening bond, a low moment, lift, final image that moves the reader.`;

function buildBeatSheetPrompt(brainDump, existingStory) {
  if (existingStory) {
    return `Plan an elevated version of this story. Keep all valid material; make the arc more gripping and emotional.

EXISTING STORY (for reference — do not rewrite, only plan):
${existingStory.slice(0, 8000)}${existingStory.length > 8000 ? '\n[…truncated…]' : ''}

BRAIN DUMP (every detail must map to a beat):
${brainDump}

Output the beat sheet now.`;
  }

  return `Plan the full Lennon story from this brain dump.

BRAIN DUMP:
${brainDump}

Output the beat sheet now.`;
}

function beatSheetBlock(beatSheet) {
  if (!beatSheet?.trim()) return '';
  return `## Story architecture (follow this arc — dramatize each beat fully)
${beatSheet.trim()}

`;
}

function buildFirstStoryPrompt(brainDump, beatSheet) {
  return `${beatSheetBlock(beatSheet)}## Task
Write the Lennon story. Make it **unputdownable** — literary, emotional, funny, true.

Write beats 1–${beatSheet ? 'through mid-arc' : 'as far as depth allows'} in full scene-level prose. Do not summarize. If you cannot reach the ending yet, stop on a strong story beat — not a cliffhanger gimmick.

## Brain dump (every detail must appear across the full story)
${brainDump}

## Write now
Hook immediately. Laugh / ache / wonder in balance. Blank lines between paragraphs.`;
}

function buildRefineStoryPrompt(brainDump, existingStory, beatSheet) {
  return `${beatSheetBlock(beatSheet)}## Task
Rewrite the story below into something **much more engaging** — same facts, higher craft, deeper feeling. The reader should cry, laugh, and keep turning pages.

Elevate: voice, openings, pacing, subtext, robot comedy, family pain, final resonance. Keep every brain-dump detail and every good moment from before — but **never** stay boring where a scene could breathe.

## Previous story
${existingStory}

## Brain dump
${brainDump}

## Write the complete elevated story.`;
}

function buildContinuePrompt(brainDump, storySoFar, partNumber, beatSheet) {
  const context = buildStoryContextForContinue(storySoFar);

  return `${beatSheetBlock(beatSheet)}## Task — continue (segment ${partNumber})

Pick up **exactly** after the last sentence. Same voice as the opening. No recap.

Write the next long section in full scenes. More emotion, more specificity, more stupid robot grace. Cover remaining brain-dump beats not yet dramatized. Do not end the story until those beats are lived — unless this segment reaches the final beats.

## Story so far
${context}

## Brain dump
${brainDump}

## Continue.`;
}

function buildEndingPrompt(brainDump, storySoFar, beatSheet) {
  const context = buildStoryContextForContinue(storySoFar);

  return `${beatSheetBlock(beatSheet)}## Task — final ending

Write the closing movement. Continue from the last sentence. Land emotion in the chest — joy, love, wholeness — through a **specific** final image, not a speech.

Tie remaining brain-dump threads. This is the page the reader remembers.

## Story so far
${context}

## Brain dump
${brainDump}

## Write the ending.`;
}

function stageProgressLabel({ stage, forceEndingNext, isRefine, phase }) {
  if (phase === 'plan') return 'planning story arc…';
  if (phase === 'save_draft') return 'saving brain dump…';
  if (phase === 'save_story') return 'saving story…';
  if (phase === 'prepare') return 'preparing…';
  if (stage === 1) return isRefine ? 'rewriting story…' : 'writing opening…';
  if (forceEndingNext) return 'writing ending…';
  return `writing part ${stage}…`;
}

function stageProgressPercent({ phase, stage, maxStages, stageComplete }) {
  if (phase === 'prepare') return 2;
  if (phase === 'plan') return 6;
  if (phase === 'save_draft') return 8;
  if (phase === 'save_story') return 96;
  if (phase === 'complete') return 100;

  const base = 10;
  const span = 82;
  const ratio = stageComplete ? stage / maxStages : (stage - 1) / maxStages + 0.06;
  return Math.min(94, Math.round(base + ratio * span));
}

async function generateBeatSheet(brainDump, existingStory, onProgress) {
  const messages = [
    { role: 'system', content: BEAT_SHEET_SYSTEM },
    { role: 'user', content: buildBeatSheetPrompt(brainDump, existingStory) }
  ];

  if (onProgress) {
    onProgress({
      phase: 'plan',
      stage: 1,
      stageComplete: false,
      label: stageProgressLabel({ phase: 'plan', stage: 1 }),
      percent: stageProgressPercent({ phase: 'plan', stage: 1 })
    });
  }

  const result = await completeEisenkindStoryCall(messages, {
    maxTokensCeiling: BEAT_SHEET_MAX_TOKENS,
    temperature: 0.45,
    frequencyPenalty: 0,
    presencePenalty: 0
  });

  if (!result.success) {
    console.warn('⚠️ Beat sheet generation failed, continuing without plan:', result.error);
    return '';
  }

  return result.story;
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

  const beatSheet = await generateBeatSheet(brainDump, existingStory, report);

  const writeCallOptions = {
    temperature: 0.76,
    frequencyPenalty: 0.14,
    presencePenalty: 0.1
  };

  const continueCallOptions = {
    temperature: 0.68,
    frequencyPenalty: 0.1,
    presencePenalty: 0.06
  };

  while (stage <= MAX_STORY_STAGES) {
    let userPrompt;
    let callOptions = writeCallOptions;

    if (stage === 1) {
      userPrompt = isRefine
        ? buildRefineStoryPrompt(brainDump, existingStory, beatSheet)
        : buildFirstStoryPrompt(brainDump, beatSheet);
    } else if (forceEndingNext) {
      userPrompt = buildEndingPrompt(brainDump, story, beatSheet);
      callOptions = { ...writeCallOptions, temperature: 0.72 };
    } else {
      userPrompt = buildContinuePrompt(brainDump, story, stage, beatSheet);
      callOptions = continueCallOptions;
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const stageLabel = stageProgressLabel({ stage, forceEndingNext, isRefine, phase: 'writing' });
    report({ phase: 'writing', stage, stageComplete: false, label: stageLabel });

    console.log(`📝 Eisenkind story stage ${stage}/${MAX_STORY_STAGES}…`);
    const result = await completeEisenkindStoryCall(messages, callOptions);

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

    if (!forceEndingNext && storyLikelyNeedsEnding(story, stage) && stage < MAX_STORY_STAGES) {
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

/** One step per HTTP request — avoids serverless timeouts on long stories. */
async function runStoryStep({
  action,
  brainDump,
  existingStory = '',
  beatSheet = '',
  storySoFar = '',
  stage = 1,
  forceEndingNext = false
}) {
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

  if (action === 'plan') {
    const sheet = await generateBeatSheet(fitted.brainDump, fitted.existingStory || undefined);
    return {
      success: true,
      action: 'plan',
      beatSheet: sheet,
      done: false,
      label: stageProgressLabel({ phase: 'plan', stage: 1 }),
      percent: stageProgressPercent({ phase: 'plan', stage: 1 })
    };
  }

  if (action !== 'write') {
    return { success: false, error: 'Unknown story step action.' };
  }

  const priorStory = storySoFar.trim();
  const isRefine = Boolean(fitted.existingStory) && stage === 1 && !priorStory;
  let story = priorStory;
  const sheet = beatSheet || '';

  const writeCallOptions = {
    temperature: 0.76,
    frequencyPenalty: 0.14,
    presencePenalty: 0.1
  };
  const continueCallOptions = {
    temperature: 0.68,
    frequencyPenalty: 0.1,
    presencePenalty: 0.06
  };

  let userPrompt;
  let callOptions = writeCallOptions;

  if (stage === 1 && !forceEndingNext) {
    userPrompt = isRefine
      ? buildRefineStoryPrompt(fitted.brainDump, fitted.existingStory, sheet)
      : buildFirstStoryPrompt(fitted.brainDump, sheet);
  } else if (forceEndingNext) {
    userPrompt = buildEndingPrompt(fitted.brainDump, story, sheet);
    callOptions = { ...writeCallOptions, temperature: 0.72 };
  } else {
    userPrompt = buildContinuePrompt(fitted.brainDump, story, stage, sheet);
    callOptions = continueCallOptions;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  const stageLabel = stageProgressLabel({ stage, forceEndingNext, isRefine, phase: 'writing' });
  console.log(`📝 Eisenkind story step: stage ${stage}, ending=${forceEndingNext}`);

  const result = await completeEisenkindStoryCall(messages, callOptions);
  if (!result.success) return result;

  story = stage === 1 && !priorStory ? result.story : mergeStoryContinuation(priorStory, result.story);

  let nextStage = stage;
  let nextForceEnding = forceEndingNext;
  let done = false;

  if (
    shouldContinueWriting({
      finishReason: result.finishReason,
      story,
      brainDump: fitted.brainDump,
      stage,
      forceEndingNext
    })
  ) {
    nextStage = stage + 1;
  } else if (!forceEndingNext && storyLikelyNeedsEnding(story, stage) && stage < MAX_STORY_STAGES) {
    nextStage = stage + 1;
    nextForceEnding = true;
  } else {
    done = true;
  }

  return {
    success: true,
    action: 'write',
    story,
    beatSheet: sheet,
    stage: nextStage,
    forceEndingNext: nextForceEnding,
    done,
    storyChars: story.length,
    label: stageLabel,
    percent: stageProgressPercent({
      phase: 'writing',
      stage,
      stageComplete: true,
      maxStages: MAX_STORY_STAGES
    }),
    model: result.model
  };
}

module.exports = { generateEisenkindStory, runStoryStep };
