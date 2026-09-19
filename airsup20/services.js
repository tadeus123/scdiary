const { createTracer } = require('./trace');
const { probeCandidate, deepTalk } = require('./endpoint');
const { prepareListingMedia, MEDIA_RETRY_HINT } = require('./util');

const INTENT_TYPES = new Set(['WANT', 'NEED', 'OFFER', 'OPEN_TO', 'AVOID']);

function needsSetup(user) {
  return !user || !user.onboarded_at;
}

function setupQuestions() {
  return [
    {
      id: 'who',
      prompt: 'Who are you in one or two sentences (name optional, city/role useful)?',
    },
    {
      id: 'looking_for',
      prompt: 'What are you hoping Airsup helps you find or do right now?',
    },
    {
      id: 'offer',
      prompt: 'What can you offer others (skills, things for sale, help, company)?',
    },
    {
      id: 'contact',
      prompt: 'Optional: how should matched people reach you in the real world (phone, WeChat, etc.)?',
    },
  ];
}

function publicUser(user) {
  if (!user) return null;
  return {
    user_id: user.user_id,
    display_name: user.display_name || '',
    email: user.email || '',
    picture: user.picture || '',
    locale: user.locale || '',
    onboarded: Boolean(user.onboarded_at),
  };
}

async function unreadInboxCount(store, userId) {
  const items = await store.listInbox(userId, { status: 'unread', limit: 50 });
  return items.length;
}

function createServices({ store, fetchImpl } = {}) {
  const tracer = createTracer(store);

  async function withToolTrace(user, toolName, fn) {
    const trace = await tracer.startTrace({
      userId: user && user.user_id,
      toolName,
      meta: {},
    });
    const status = [];
    try {
      const result = await fn(trace, status);
      const ended = await tracer.endTrace(trace, { status: 'ok', meta: { status_labels: status } });
      return {
        ...result,
        trace_id: trace.trace_id,
        duration_ms: ended.duration_ms,
        status_labels: status,
      };
    } catch (error) {
      await tracer.endTrace(trace, { status: 'error', meta: { error: String(error.message || error) } });
      throw error;
    }
  }

  async function getMe(user) {
    return withToolTrace(user, 'me', async (trace, status) => {
      status.push('loading profile');
      const listing = await tracer.timed(trace, 'db.get_listing', () => store.getListing(user.user_id));
      const intents = await tracer.timed(trace, 'db.list_intents', () => store.listIntents(user.user_id, { activeOnly: true }));
      const inboxUnread = await tracer.timed(trace, 'db.inbox_unread', () => unreadInboxCount(store, user.user_id));
      const needs = needsSetup(user);
      if (needs) status.push('setup required');
      if (inboxUnread) status.push(`inbox has ${inboxUnread} unread`);
      return {
        ok: true,
        user: publicUser(user),
        needs_setup: needs,
        setup_questions: needs ? setupQuestions() : [],
        listing: listing ? { body: listing.body, media: listing.media, updated_at: listing.updated_at } : { body: {}, media: [] },
        intents: intents.map((i) => ({
          intent_id: i.intent_id,
          type: i.type,
          object: i.object,
          status: i.status,
          strength: i.strength,
          confidence: i.confidence,
        })),
        inbox_unread: inboxUnread,
        note: needs
          ? 'Initial setup required. Ask the user the setup_questions, then call setup with answers, any relevant ChatGPT context, and any attached pictures in media.'
          : 'Ready. Use fulfill for goals, update_listing to change the listing (including pictures via media), get_inbox for inbox.',
      };
    });
  }

  async function setup(user, args) {
    return withToolTrace(user, 'setup', async (trace, status) => {
      status.push('saving setup');
      const answers = (args && args.answers && typeof args.answers === 'object') ? args.answers : {};
      const context = String((args && args.context) || '').trim();
      const listingPatch = (args && args.listing && typeof args.listing === 'object') ? args.listing : {};
      const intentsIn = Array.isArray(args && args.intents) ? args.intents : [];
      const preparedMedia = prepareListingMedia(args && args.media);
      const media = preparedMedia.provided ? preparedMedia.media : undefined;
      const mediaError = preparedMedia.provided && preparedMedia.media.length === 0
        ? MEDIA_RETRY_HINT
        : null;

      const body = {
        ...listingPatch,
        setup: answers,
        about: answers.who || listingPatch.about || '',
        looking_for: answers.looking_for || listingPatch.looking_for || '',
        offer: answers.offer || listingPatch.offer || '',
      };
      if (answers.contact) body.contact = answers.contact;

      const listing = await tracer.timed(trace, 'db.upsert_listing', () => store.upsertListing(user.user_id, {
        body,
        media,
        merge: true,
      }));

      if (answers.who) {
        await tracer.timed(trace, 'db.fact_who', () => store.insertFact({
          user_id: user.user_id,
          statement: String(answers.who),
          confidence: 0.9,
          source: 'explicit',
        }));
      }
      if (context) {
        await tracer.timed(trace, 'db.fact_context', () => store.insertFact({
          user_id: user.user_id,
          statement: `ChatGPT-provided context: ${context.slice(0, 4000)}`,
          confidence: 0.6,
          source: 'chatgpt_context',
        }));
      }

      const createdIntents = [];
      const seeds = intentsIn.length ? intentsIn : [
        answers.looking_for ? { type: 'WANT', object: answers.looking_for } : null,
        answers.offer ? { type: 'OFFER', object: answers.offer } : null,
      ].filter(Boolean);

      for (const seed of seeds) {
        const type = INTENT_TYPES.has(String(seed.type || '').toUpperCase())
          ? String(seed.type).toUpperCase()
          : 'WANT';
        const object = String(seed.object || '').trim();
        if (!object) continue;
        const intent = await store.insertIntent({
          user_id: user.user_id,
          type,
          object,
          status: 'active',
          strength: Number(seed.strength != null ? seed.strength : 0.8),
          confidence: Number(seed.confidence != null ? seed.confidence : 0.9),
          source: 'explicit',
        });
        await store.insertIntentEvidence({
          intent_id: intent.intent_id,
          evidence_text: object,
        });
        createdIntents.push(intent);
      }

      await tracer.timed(trace, 'db.mark_onboarded', () => store.markOnboarded(user.user_id));
      await store.insertRawEvent({
        userId: user.user_id,
        kind: 'setup_completed',
        payload: { answers, context: context.slice(0, 2000) },
      });
      if (preparedMedia.provided && preparedMedia.media.length) status.push(`saved ${preparedMedia.media.length} picture(s)`);
      else if (mediaError) status.push('pictures missing usable url');
      if (preparedMedia.provided && preparedMedia.media.length) status.push(`saved ${preparedMedia.media.length} picture(s)`);
      else if (mediaError) status.push('pictures missing usable url');
      status.push('setup complete');
      const fresh = await store.getUser(user.user_id);
      return {
        ok: true,
        user: publicUser(fresh),
        listing: { body: listing.body, media: listing.media },
        intents_created: createdIntents.length,
        needs_setup: false,
        media_added: preparedMedia.provided ? preparedMedia.media.length : 0,
        media_count: Array.isArray(listing.media) ? listing.media.length : 0,
        media_error: mediaError,
      };
    });
  }

  async function updateListing(user, args) {
    return withToolTrace(user, 'update_listing', async (trace, status) => {
      if (needsSetup(user)) {
        status.push('setup required');
        return {
          ok: false,
          needs_setup: true,
          setup_questions: setupQuestions(),
          note: 'Complete setup first.',
        };
      }
      status.push('updating listing');
      const patch = (args && args.patch && typeof args.patch === 'object') ? args.patch : {};
      const replace = args && args.replace === true;
      const preparedMedia = prepareListingMedia(args && args.media);
      const media = preparedMedia.provided ? preparedMedia.media : undefined;
      const mediaError = preparedMedia.provided && preparedMedia.media.length === 0
        ? MEDIA_RETRY_HINT
        : null;
      const note = String((args && args.note) || '').trim();
      const body = { ...patch };
      if (note) body.last_note = note;

      const listing = await tracer.timed(trace, 'db.upsert_listing', () => store.upsertListing(user.user_id, {
        body: replace ? body : body,
        media,
        merge: !replace,
      }));

      const intentsIn = Array.isArray(args && args.intents) ? args.intents : [];
      for (const seed of intentsIn) {
        const type = INTENT_TYPES.has(String(seed.type || '').toUpperCase())
          ? String(seed.type).toUpperCase()
          : 'WANT';
        const object = String(seed.object || '').trim();
        if (!object) continue;
        const intent = await store.insertIntent({
          user_id: user.user_id,
          type,
          object,
          status: String(seed.status || 'active'),
          strength: Number(seed.strength != null ? seed.strength : 0.7),
          confidence: Number(seed.confidence != null ? seed.confidence : 0.8),
          source: 'explicit',
        });
        await store.insertIntentEvidence({
          intent_id: intent.intent_id,
          evidence_text: note || object,
        });
      }

      if (note) {
        await store.insertFact({
          user_id: user.user_id,
          statement: note,
          confidence: 0.75,
          source: 'explicit',
        });
      }

      await store.insertRawEvent({
        userId: user.user_id,
        kind: 'listing_updated',
        payload: { patch: body, media_count: Array.isArray(media) ? media.length : 0 },
      });
      if (preparedMedia.provided && preparedMedia.media.length) status.push(`saved ${preparedMedia.media.length} picture(s)`);
      else if (mediaError) status.push('pictures missing usable url');
      status.push('listing saved');
      return {
        ok: true,
        listing: { body: listing.body, media: listing.media, updated_at: listing.updated_at },
        media_added: preparedMedia.provided ? preparedMedia.media.length : 0,
        media_count: Array.isArray(listing.media) ? listing.media.length : 0,
        media_error: mediaError,
      };
    });
  }

  async function getInbox(user, args) {
    return withToolTrace(user, 'get_inbox', async (trace, status) => {
      status.push('reading inbox');
      const statusFilter = args && args.status ? String(args.status) : undefined;
      const items = await tracer.timed(trace, 'db.list_inbox', () => store.listInbox(user.user_id, {
        status: statusFilter,
        limit: args && args.limit,
      }));
      if (args && args.mark_seen === true) {
        for (const item of items) {
          if (item.status === 'unread') {
            await store.updateInboxItem(item.item_id, user.user_id, { status: 'seen' });
            item.status = 'seen';
          }
        }
        status.push('marked seen');
      }
      status.push(items.length ? `found ${items.length}` : 'empty');
      return {
        ok: true,
        items: items.map((item) => ({
          item_id: item.item_id,
          from_user_id: item.from_user_id,
          conversation_id: item.conversation_id,
          reason: item.reason,
          summary: item.summary,
          payload: item.payload,
          status: item.status,
          created_at: item.created_at,
        })),
        count: items.length,
      };
    });
  }

  async function getTrace(user, args) {
    return withToolTrace(user, 'get_trace', async (trace, status) => {
      const traceId = String((args && args.trace_id) || '').trim();
      status.push('loading trace');
      if (!traceId) {
        const recent = await store.listTraces(user.user_id, { limit: 10 });
        return { ok: true, recent };
      }
      const bundle = await tracer.getTraceBundle(traceId);
      if (!bundle) return { ok: false, error: 'trace_not_found' };
      if (bundle.trace.user_id && bundle.trace.user_id !== user.user_id) {
        return { ok: false, error: 'forbidden' };
      }
      status.push(`spans ${bundle.spans.length}`);
      return { ok: true, ...bundle };
    });
  }

  async function fulfill(user, args) {
    return withToolTrace(user, 'fulfill', async (trace, status) => {
      if (needsSetup(user)) {
        status.push('setup required');
        return {
          ok: false,
          needs_setup: true,
          setup_questions: setupQuestions(),
          answer: 'Initial setup required before Airsup20 can help.',
          inbox_unread: await unreadInboxCount(store, user.user_id),
        };
      }

      const goal = String((args && (args.goal || args.query)) || '').trim();
      if (!goal) {
        status.push('missing goal');
        return { ok: false, error: 'goal_required', answer: 'Provide a goal.' };
      }

      status.push('searching');
      const callerListing = await tracer.timed(trace, 'db.caller_listing', () => store.getListing(user.user_id));
      const callerIntents = await tracer.timed(trace, 'db.caller_intents', () => store.listIntents(user.user_id, { activeOnly: true }));
      const callerFacts = await tracer.timed(trace, 'db.caller_facts', () => store.listFacts(user.user_id));
      const inboxUnread = await unreadInboxCount(store, user.user_id);
      if (inboxUnread) status.push(`also ${inboxUnread} unread inbox`);

      const candidates = await tracer.timed(trace, 'db.search_candidates', () => store.searchCandidates({
        callerUserId: user.user_id,
        query: goal,
        limit: Number((args && args.limit) || 8),
      }));

      if (!candidates.length) {
        status.push('no candidates');
        await store.insertRawEvent({ userId: user.user_id, kind: 'fulfill_no_match', payload: { goal } });
        return {
          ok: true,
          answer: `No strong matches yet for: ${goal}`,
          matches: [],
          inbox_unread: inboxUnread,
          status_hint: 'Airsup searching found nobody relevant yet.',
        };
      }

      // Attach knowledge + prior chat context before probes/deep talk.
      const enriched = [];
      for (const candidate of candidates) {
        const facts = await store.listFacts(candidate.user.user_id);
        const priorWithCaller = await store.listPriorBetweenUsers(user.user_id, candidate.user.user_id, { limit: 12 });
        enriched.push({ ...candidate, facts, priorWithCaller });
      }

      status.push(`probing ${enriched.length}`);
      const probes = await tracer.timed(trace, 'endpoint.parallel_probes', async () => {
        const jobs = enriched.map(async (candidate) => {
          const probe = await probeCandidate({
            caller: user,
            candidate,
            goal,
            fetchImpl,
          });
          return { candidate, probe };
        });
        return Promise.all(jobs);
      });

      probes.sort((a, b) => b.probe.score - a.probe.score);
      const deepTargets = probes.filter((p) => p.probe.worth_deeper || p.probe.score >= 0.35).slice(0, 3);
      if (!deepTargets.length) deepTargets.push(probes[0]);

      status.push(`talking to ${deepTargets.length}`);
      const talks = [];
      for (const target of deepTargets) {
        const result = await tracer.timed(
          trace,
          `endpoint.deep:${target.candidate.user.user_id}`,
          async () => deepTalk({
            caller: user,
            callerListing,
            callerIntents,
            callerFacts,
            candidate: target.candidate,
            goal,
            rounds: Number((args && args.rounds) || 2),
            fetchImpl,
          }),
          { meta: { score: target.probe.score } },
        );

        const conv = await store.insertConversation({
          initiator_id: user.user_id,
          recipient_id: target.candidate.user.user_id,
          goal,
          summary: result.summary_for_caller,
        });
        await store.insertMessage({
          conversation_id: conv.conversation_id,
          from_role: 'caller_endpoint',
          from_user_id: user.user_id,
          body: JSON.stringify({ goal, probe: target.probe }),
          meta: { kind: 'goal' },
        });
        await store.insertMessage({
          conversation_id: conv.conversation_id,
          from_role: 'recipient_endpoint',
          from_user_id: target.candidate.user.user_id,
          body: JSON.stringify(result.endpoint_packet || result),
          meta: { kind: 'endpoint_packet', fit: result.fit },
        });
        await store.updateConversation(conv.conversation_id, {
          summary: result.summary_for_caller,
          status: 'ended',
          ended_at: new Date().toISOString(),
        });

        let inboxItem = null;
        if (result.should_inbox_owner && result.fit !== 'no') {
          inboxItem = await store.insertInboxItem({
            user_id: target.candidate.user.user_id,
            from_user_id: user.user_id,
            conversation_id: conv.conversation_id,
            reason: goal.slice(0, 240),
            summary: result.summary_for_owner,
            payload: {
              connect: result.connect_payload || {},
              caller: publicUser(user),
              fit: result.fit,
            },
          });
          status.push('inbox notified');
        }

        talks.push({
          user_id: target.candidate.user.user_id,
          display_name: target.candidate.user.display_name || '',
          probe_score: target.probe.score,
          probe_reason: target.probe.reason,
          fit: result.fit,
          summary: result.summary_for_caller,
          connect: result.connect_payload || {},
          conversation_id: conv.conversation_id,
          inbox_item_id: inboxItem && inboxItem.item_id,
          rounds_run: result.rounds_run,
        });
      }

      status.push('answering');
      const best = talks.filter((t) => t.fit !== 'no');
      const answerLines = best.length
        ? best.map((t, i) => `${i + 1}. ${t.display_name || t.user_id} — ${t.summary}`)
        : ['No confident fit after endpoint talk.'];

      await store.insertRawEvent({
        userId: user.user_id,
        kind: 'fulfill_completed',
        payload: { goal, match_count: talks.length },
      });

      // Infer a WANT intent for the caller from this goal (evidence-backed).
      const inferred = await store.insertIntent({
        user_id: user.user_id,
        type: 'WANT',
        object: goal.slice(0, 500),
        status: 'active',
        strength: 0.7,
        confidence: 0.65,
        source: 'inferred',
      });
      await store.insertIntentEvidence({
        intent_id: inferred.intent_id,
        evidence_text: goal,
      });

      return {
        ok: true,
        answer: answerLines.join('\n'),
        matches: talks,
        inbox_unread: inboxUnread,
        status_hint: status[status.length - 1] || 'done',
      };
    });
  }

  return {
    getMe,
    setup,
    updateListing,
    getInbox,
    getTrace,
    fulfill,
    needsSetup,
    setupQuestions,
    tracer,
  };
}

module.exports = { createServices, needsSetup, setupQuestions };
