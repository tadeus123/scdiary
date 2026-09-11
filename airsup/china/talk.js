const defaultDb = require('./db');
const { companyTitle } = require('./fields');
const { completeReply } = require('./reply');
const { sendFactoryNotice } = require('./mail');

const CONV_PREFIX = 'cn_';
const THREADS_URI = 'airsup://conversations';
const THREAD_PREFIX = 'airsup://conversations/';

function failed(conversationId) {
  return { conversation_id: conversationId || '', status: 'failed', reply: null };
}

function publicConvId(thread) {
  return thread && thread.conversation_id ? CONV_PREFIX + thread.conversation_id : '';
}

function parsePublicId(value) {
  const raw = String(value || '').trim();
  if (!raw.startsWith(CONV_PREFIX)) return '';
  return raw.slice(CONV_PREFIX.length);
}

function notifyList(thread) {
  const raw = thread && thread.notify_reasons;
  if (Array.isArray(raw)) return raw.map((item) => String(item || '').trim()).filter(Boolean);
  return [];
}

function storeFrom(deps) {
  return (deps && deps.db) || defaultDb;
}

function replyFn(deps) {
  return (deps && deps.completeReply) || completeReply;
}

function mailFn(deps) {
  return (deps && deps.sendFactoryNotice) || sendFactoryNotice;
}

async function loadCompany(store, companyId) {
  if (!companyId) return null;
  return store.getById(companyId);
}

function personBrief(caller) {
  return {
    person_id: (caller && caller.person_id) || '',
    name: (caller && (caller.display_name || caller.email)) || 'Airsup buyer',
  };
}

function factoryBrief(company) {
  return {
    person_id: company.company_id,
    name: companyTitle(company, 'en') || company.domain,
  };
}

async function threadView(store, caller, thread) {
  const company = await loadCompany(store, thread.company_id);
  const messages = await store.listMessages(thread.conversation_id);
  const last = messages[messages.length - 1];
  return {
    conversation_id: publicConvId(thread),
    status: thread.status,
    other: company ? factoryBrief(company) : { person_id: thread.company_id, name: 'Supplier' },
    preview: last ? String(last.body || '').slice(0, 80) : '',
    updated_at: thread.updated_at,
  };
}

async function listThreadViews(callerPersonId, deps) {
  const store = storeFrom(deps);
  if (!callerPersonId || !store.isConfigured()) return [];
  const rows = await store.listThreadsForCaller(callerPersonId);
  const views = [];
  for (const thread of rows) {
    views.push(await threadView(store, { person_id: callerPersonId }, thread));
  }
  return views;
}

async function conversationPanel(caller, conversationId, deps) {
  const store = storeFrom(deps);
  const id = parsePublicId(conversationId);
  if (!id || !store.isConfigured()) return null;
  const thread = await store.getThread(id);
  if (!thread) return null;
  if (thread.caller_person_id && caller && caller.person_id !== thread.caller_person_id) return null;
  const company = await loadCompany(store, thread.company_id);
  if (!company) return null;
  const you = personBrief(caller);
  const other = factoryBrief(company);
  const rows = await store.listMessages(id);
  const messages = rows.map((row) => ({
    from: row.role === 'buyer' ? 'you' : 'them',
    name: row.role === 'buyer' ? you.name : other.name,
    body: String(row.body || ''),
    at: row.created_at,
  }));
  return {
    conversation_id: publicConvId(thread),
    status: thread.status,
    you,
    other,
    messages,
    threads: [],
  };
}

async function mergePanel(caller, conversationId, peoplePanel, deps) {
  const chinaPanel = await conversationPanel(caller, conversationId, deps);
  if (!chinaPanel) return peoplePanel || {};
  return chinaPanel;
}

function jsonContents(uri, payload) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(payload),
      },
    ],
  };
}

async function mergeResourceContents(caller, uri, contents, deps) {
  const requested = String(uri || '');
  if (requested === THREADS_URI) {
    const extra = caller && caller.person_id ? await listThreadViews(caller.person_id, deps) : [];
    const payload = JSON.parse((contents && contents.contents && contents.contents[0] && contents.contents[0].text) || '{"threads":[]}');
    payload.threads = [...(payload.threads || []), ...extra];
    return jsonContents(THREADS_URI, payload);
  }
  if (requested.startsWith(THREAD_PREFIX)) {
    const conversationId = requested.slice(THREAD_PREFIX.length);
    const chinaPanel = await conversationPanel(caller, conversationId, deps);
    const extra = caller && caller.person_id ? await listThreadViews(caller.person_id, deps) : [];
    if (!chinaPanel) {
      const payload = JSON.parse((contents && contents.contents && contents.contents[0] && contents.contents[0].text) || '{}');
      payload.threads = [...(payload.threads || []), ...extra];
      return jsonContents(requested, payload);
    }
    const payload = JSON.parse((contents && contents.contents && contents.contents[0] && contents.contents[0].text) || '{"threads":[]}');
    chinaPanel.threads = [...(payload.threads || []), ...extra];
    return jsonContents(requested, chinaPanel);
  }
  return contents;
}

async function maybeEnd(caller, conversationId, deps) {
  const id = parsePublicId(conversationId);
  if (!id) return null;
  const store = storeFrom(deps);
  const publicId = CONV_PREFIX + id;
  if (!store.isConfigured()) return { conversation_id: publicId, status: 'ended' };
  const thread = await store.getThread(id);
  if (!thread) return { conversation_id: publicId, status: 'ended' };
  if (thread.caller_person_id && caller && caller.person_id !== thread.caller_person_id) {
    return { conversation_id: publicConvId(thread), status: 'ended' };
  }
  if (thread.status !== 'ended') {
    await store.updateThread(id, {
      status: 'ended',
      ended_at: new Date().toISOString(),
    });
  }
  return { conversation_id: publicConvId(thread), status: 'ended' };
}

async function notifyIfNeeded(store, { thread, company, caller, message, reply, outcome, deps }) {
  const reason = outcome.notify_reason;
  if (!outcome.notify_factory || !reason || reason === 'none') return thread;
  const reasons = notifyList(thread);
  if (reasons.includes(reason)) return thread;
  const next = await store.updateThread(thread.conversation_id, {
    notify_reasons: [...reasons, reason],
    emailed_at: new Date().toISOString(),
    rfq: outcome.rfq,
  });
  Promise.resolve(mailFn(deps)({
    company,
    callerName: caller && (caller.display_name || caller.email),
    message,
    reply,
    rfq: outcome.rfq,
    reason,
  })).catch((error) => {
    console.error('Airsup china factory notice failed:', error.message);
  });
  return next;
}

async function turn(store, { thread, company, caller, message, deps }) {
  if (thread.status === 'ended') return failed(publicConvId(thread));
  if (company.status !== 'live') {
    const reply = `${companyTitle(company, 'en')} paused this Airsup endpoint. It is not answering new buyer messages.`;
    return { conversation_id: publicConvId(thread), status: 'replied', reply };
  }
  const outcome = await replyFn(deps)({
    company,
    caller,
    history: [],
    message,
    rfq: thread.rfq,
  });
  const reply = String(outcome.reply || '').trim();
  await store.insertMessage({
    conversation_id: thread.conversation_id,
    role: 'buyer',
    body: message,
  });
  await store.insertMessage({
    conversation_id: thread.conversation_id,
    role: 'factory',
    body: reply,
  });
  store.insertInquiry({
    company_id: company.company_id,
    caller_person_id: caller && caller.person_id ? caller.person_id : null,
    conversation_id: thread.conversation_id,
    message,
    reply,
  }).catch((error) => {
    console.error('Airsup china inquiry log failed:', error.message);
  });
  let next = await store.updateThread(thread.conversation_id, { rfq: outcome.rfq });
  next = await notifyIfNeeded(store, { thread: next, company, caller, message, reply, outcome, deps });
  return {
    conversation_id: publicConvId(next || thread),
    status: 'replied',
    reply,
  };
}

async function resolveThread(store, conversationId) {
  const raw = String(conversationId || '').trim();
  if (!raw) return null;
  const prefixed = parsePublicId(raw);
  try {
    if (prefixed) return store.getThread(prefixed);
    return store.getThread(raw);
  } catch {
    return null;
  }
}

async function maybeHandle(caller, args, deps) {
  const store = storeFrom(deps);
  if (!store.isConfigured()) return null;
  const personId = String((args && args.person_id) || '').trim();
  const conversationId = String((args && args.conversation_id) || '').trim();
  const message = String((args && args.message) || '').trim();

  if (conversationId) {
    const thread = await resolveThread(store, conversationId);
    if (thread) {
      if (!message) return failed(publicConvId(thread));
      if (thread.caller_person_id && caller && caller.person_id !== thread.caller_person_id) {
        return failed(publicConvId(thread));
      }
      const company = await loadCompany(store, thread.company_id);
      if (!company) return failed(publicConvId(thread));
      return turn(store, { thread, company, caller, message, deps });
    }
    if (parsePublicId(conversationId)) return failed(conversationId);
  }

  if (!personId) return null;
  let company = null;
  try {
    company = await store.getById(personId);
  } catch {
    company = null;
  }
  if (!company) return null;
  if (!message) return failed('');
  if (company.status !== 'live') {
    return {
      conversation_id: '',
      status: 'replied',
      reply: `${companyTitle(company, 'en')} paused this Airsup endpoint. It is not answering new buyer messages.`,
    };
  }
  let thread = await store.findOpenThread(company.company_id, caller && caller.person_id);
  if (!thread) {
    thread = await store.insertThread({
      company_id: company.company_id,
      caller_person_id: caller && caller.person_id ? caller.person_id : null,
      status: 'open',
      rfq: {},
      notify_reasons: [],
    });
  }
  return turn(store, { thread, company, caller, message, deps });
}

module.exports = {
  CONV_PREFIX,
  parsePublicId,
  maybeHandle,
  maybeEnd,
  conversationPanel,
  listThreadViews,
  mergePanel,
  mergeResourceContents,
};
