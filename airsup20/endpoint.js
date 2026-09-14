const PROBE_MS = 4000;
const DEEP_MS = 12000;
const PROBE_MODEL = process.env.AIRSUP20_PROBE_MODEL || 'gpt-4o-mini';
const DEEP_MODEL = process.env.AIRSUP20_DEEP_MODEL || 'gpt-4o-mini';

function workingContext({ user, listing, facts, intents, priorWithCaller }) {
  return {
    identity: {
      user_id: user.user_id,
      display_name: user.display_name || '',
      locale: user.locale || '',
    },
    listing: listing ? { body: listing.body || {}, media: listing.media || [] } : { body: {}, media: [] },
    facts: (facts || []).slice(0, 40).map((f) => ({
      statement: f.statement,
      confidence: f.confidence,
      source: f.source,
    })),
    intents: (intents || []).slice(0, 40).map((i) => ({
      type: i.type,
      object: i.object,
      status: i.status,
      strength: i.strength,
      confidence: i.confidence,
      time_horizon: i.time_horizon,
      visibility: i.visibility,
    })),
    prior_with_caller: (priorWithCaller || []).slice(-12).map((m) => ({
      from_role: m.from_role,
      body: String(m.body || '').slice(0, 4000),
    })),
  };
}

function fallbackProbe({ candidate, goal }) {
  const listingText = candidate.listing && candidate.listing.text_blob ? candidate.listing.text_blob : '';
  const intents = (candidate.intents || []).map((i) => `${i.type}:${i.object}`).join('; ');
  const hay = `${listingText}\n${intents}`.toLowerCase();
  const tokens = String(goal || '').toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  let hits = 0;
  for (const token of tokens) {
    if (hay.includes(token)) hits += 1;
  }
  const score = tokens.length ? hits / tokens.length : 0;
  return {
    score: Number(score.toFixed(3)),
    reason: hits ? `Lexical overlap on ${hits} token(s).` : 'No clear lexical overlap.',
    worth_deeper: score >= 0.25,
  };
}

function fallbackDeep({ caller, candidate, goal }) {
  const name = (candidate.user && candidate.user.display_name) || 'Someone';
  const contact = extractContact(candidate.listing);
  return {
    fit: 'possible',
    summary_for_caller: `${name} may be relevant for: ${String(goal || '').slice(0, 200)}`,
    summary_for_owner: `${(caller && caller.display_name) || 'Someone'} is looking for: ${String(goal || '').slice(0, 200)}`,
    should_inbox_owner: true,
    connect_payload: contact,
    endpoint_packet: {
      goal,
      owner_listing: candidate.listing && candidate.listing.body,
      owner_intents: candidate.intents,
      note: 'fallback_without_openai',
    },
  };
}

function extractContact(listing) {
  const body = (listing && listing.body) || {};
  const out = {};
  for (const key of ['phone', 'wechat', 'whatsapp', 'telegram', 'email', 'paypal', 'contact', 'qr']) {
    if (body[key]) out[key] = body[key];
  }
  if (Array.isArray(listing && listing.media)) {
    const qr = listing.media.find((m) => m && /qr|paypal/i.test(String(m.caption || m.name || '')));
    if (qr) out.media = qr;
  }
  return out;
}

async function openaiJson({ model, system, user, maxTokens, timeoutMs, fetchImpl }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key && !fetchImpl) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key || 'test'}`,
        'Content-Type': 'application/json',
      },
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return JSON.parse(String(text || '{}'));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeCandidate({ caller, candidate, goal, fetchImpl }) {
  const fallback = fallbackProbe({ candidate, goal });
  const ctx = workingContext({
    user: candidate.user,
    listing: candidate.listing,
    facts: [],
    intents: candidate.intents,
    priorWithCaller: [],
  });
  const parsed = await openaiJson({
    model: PROBE_MODEL,
    maxTokens: 180,
    timeoutMs: PROBE_MS,
    fetchImpl,
    system: 'You are a fast matcher for Airsup20. Score whether this person endpoint is worth a deeper talk for the caller goal. Return JSON only: {score:0-1, reason:string, worth_deeper:boolean}. Be strict. Prefer false unless there is a real fit.',
    user: JSON.stringify({
      goal,
      caller: { user_id: caller.user_id, name: caller.display_name },
      endpoint_context: ctx,
    }),
  });
  if (!parsed || typeof parsed !== 'object') return fallback;
  return {
    score: Math.max(0, Math.min(1, Number(parsed.score != null ? parsed.score : fallback.score))),
    reason: String(parsed.reason || fallback.reason).slice(0, 400),
    worth_deeper: Boolean(parsed.worth_deeper != null ? parsed.worth_deeper : fallback.worth_deeper),
  };
}

async function deepTalk({ caller, callerListing, callerIntents, candidate, goal, rounds, fetchImpl }) {
  const maxRounds = Math.min(Math.max(Number(rounds) || 2, 1), 4);
  const fallback = fallbackDeep({ caller, candidate, goal });
  const ownerCtx = workingContext({
    user: candidate.user,
    listing: candidate.listing,
    facts: [],
    intents: candidate.intents,
    priorWithCaller: [],
  });
  const callerCtx = workingContext({
    user: caller,
    listing: callerListing,
    facts: [],
    intents: callerIntents,
    priorWithCaller: [],
  });

  let packet = {
    goal,
    caller_context: callerCtx,
    owner_context: ownerCtx,
    transcript: [],
  };

  for (let i = 0; i < maxRounds; i += 1) {
    const parsed = await openaiJson({
      model: DEEP_MODEL,
      maxTokens: 900,
      timeoutMs: DEEP_MS,
      fetchImpl,
      system: [
        'You are the Airsup20 endpoint runtime.',
        'Two AIs negotiate on behalf of humans. Exchange dense, high-bandwidth context — not human chat bubbles.',
        'Use only provided listing/intents/facts. Do not invent private contact data that is not listed.',
        'Return JSON: {',
        '  continue:boolean,',
        '  endpoint_packet:object,',
        '  fit:"yes"|"possible"|"no",',
        '  summary_for_caller:string,',
        '  summary_for_owner:string,',
        '  should_inbox_owner:boolean,',
        '  connect_payload:object',
        '}',
        'connect_payload may include phone/wechat/paypal/etc only if present on the owner listing.',
      ].join(' '),
      user: JSON.stringify({ round: i + 1, of: maxRounds, packet }),
    });
    if (!parsed || typeof parsed !== 'object') {
      packet.transcript.push({ round: i + 1, fallback: true });
      break;
    }
    packet = {
      ...packet,
      endpoint_packet: parsed.endpoint_packet || packet.endpoint_packet,
      transcript: [...packet.transcript, { round: i + 1, parsed }],
      last: parsed,
    };
    if (!parsed.continue) break;
  }

  const last = packet.last;
  if (!last) return { ...fallback, endpoint_packet: packet, rounds_run: packet.transcript.length };
  return {
    fit: String(last.fit || 'possible'),
    summary_for_caller: String(last.summary_for_caller || fallback.summary_for_caller).slice(0, 2000),
    summary_for_owner: String(last.summary_for_owner || fallback.summary_for_owner).slice(0, 2000),
    should_inbox_owner: Boolean(last.should_inbox_owner),
    connect_payload: last.connect_payload && typeof last.connect_payload === 'object'
      ? last.connect_payload
      : fallback.connect_payload,
    endpoint_packet: packet,
    rounds_run: packet.transcript.length,
  };
}

module.exports = {
  workingContext,
  probeCandidate,
  deepTalk,
  extractContact,
  fallbackProbe,
  fallbackDeep,
};
