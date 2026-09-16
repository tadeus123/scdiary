const { maybeHandle, isCompanyId } = require('./talk');
const { companyTitle } = require('./fields');
const { MAX_TARGETS, stripPrefix } = require('./targets');

const MAX_BATCH = MAX_TARGETS;
const CONCURRENCY = 32;
const PEOPLE_FAIL_REPLY =
  'Multi-target send_message is for live factory endpoints and conversation continues only. Use a single send_message for people.';

function normalizeIds(personIds) {
  const seen = new Set();
  const ids = [];
  for (const raw of Array.isArray(personIds) ? personIds : []) {
    const id = stripPrefix(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function mapPool(items, concurrency, worker) {
  const out = new Array(items.length);
  let next = 0;
  async function run() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  }
  const n = Math.max(1, Math.min(Number(concurrency) || CONCURRENCY, items.length || 1));
  await Promise.all(Array.from({ length: n }, () => run()));
  return out;
}

function slotFailed(target, reply) {
  return {
    to: target,
    person_id: '',
    name: '',
    conversation_id: '',
    status: 'failed',
    reply: reply || null,
  };
}

function slotFromHandle(target, handled, company) {
  const name = company
    ? (companyTitle(company, 'en') || company.domain || '')
    : ((handled && handled._panel && handled._panel.other && handled._panel.other.name) || '');
  const conversationId = String((handled && handled.conversation_id) || '');
  const personId = company && company.company_id
    ? company.company_id
    : ((handled && handled._panel && handled._panel.other && handled._panel.other.person_id) || '');
  return {
    to: target,
    person_id: String(personId || ''),
    name: String(name || ''),
    conversation_id: conversationId,
    status: String((handled && handled.status) || 'failed'),
    reply: handled && handled.reply != null ? handled.reply : null,
  };
}

function looksLikeConversationId(id) {
  return String(id || '').trim().startsWith('cn_');
}

async function runOneTarget(caller, target, message, deps) {
  const id = stripPrefix(target);
  if (!id) return slotFailed(target, null);

  if (looksLikeConversationId(id)) {
    const handled = await maybeHandle(caller, { conversation_id: id, message }, deps);
    if (!handled) {
      return slotFailed(id, 'Unknown or inaccessible conversation.');
    }
    return slotFromHandle(id, handled, null);
  }

  const company = await isCompanyId(id, deps);
  if (!company) {
    return slotFailed(id, PEOPLE_FAIL_REPLY);
  }
  const handled = await maybeHandle(caller, { person_id: id, message }, deps);
  if (!handled) {
    return slotFailed(id, PEOPLE_FAIL_REPLY);
  }
  let companyRow = null;
  try {
    const store = (deps && deps.db) || require('./db');
    companyRow = await store.getById(id);
  } catch {
    companyRow = null;
  }
  return slotFromHandle(id, handled, companyRow);
}

async function sendToMany(caller, { targets, message }, deps) {
  const ids = normalizeIds(targets);
  if (!ids.length) {
    return { results: [], completed: 0, failed: 0, error: 'to required' };
  }
  if (ids.length > MAX_BATCH) {
    return {
      results: [],
      completed: 0,
      failed: 0,
      error: `to exceeds maximum of ${MAX_BATCH}`,
    };
  }
  const text = String(message || '').trim();
  if (!text) {
    return { results: [], completed: 0, failed: ids.length, error: 'message required' };
  }

  const results = await mapPool(ids, CONCURRENCY, async (target) => {
    try {
      return await runOneTarget(caller, target, text, deps);
    } catch (error) {
      console.error('Airsup china batch slot failed:', error.message);
      return slotFailed(target, null);
    }
  });

  let completed = 0;
  let failed = 0;
  for (const row of results) {
    if (row && row.status === 'replied') completed += 1;
    else failed += 1;
  }
  return { results, completed, failed };
}

/** @deprecated Prefer sendToMany; kept for callers using person_ids. */
async function sendBatch(caller, { person_ids, message }, deps) {
  return sendToMany(caller, { targets: person_ids, message }, deps);
}

module.exports = {
  MAX_BATCH,
  CONCURRENCY,
  normalizeIds,
  mapPool,
  sendBatch,
  sendToMany,
  PEOPLE_FAIL_REPLY,
};
