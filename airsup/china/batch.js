const { maybeHandle, isCompanyId } = require('./talk');
const { companyTitle } = require('./fields');

const MAX_BATCH = 1000;
const CONCURRENCY = 32;
const PEOPLE_FAIL_REPLY =
  'Batch send_message is for live factory endpoints only. Use a single send_message with person_id for people.';

function normalizeIds(personIds) {
  const seen = new Set();
  const ids = [];
  for (const raw of Array.isArray(personIds) ? personIds : []) {
    const id = String(raw || '').trim();
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

function slotFailed(personId, reply) {
  return {
    person_id: personId,
    name: '',
    conversation_id: '',
    status: 'failed',
    reply: reply || null,
  };
}

function slotFromHandle(personId, handled, company) {
  const name = company
    ? (companyTitle(company, 'en') || company.domain || '')
    : ((handled && handled._panel && handled._panel.other && handled._panel.other.name) || '');
  return {
    person_id: personId,
    name: String(name || ''),
    conversation_id: String((handled && handled.conversation_id) || ''),
    status: String((handled && handled.status) || 'failed'),
    reply: handled && handled.reply != null ? handled.reply : null,
  };
}

async function sendBatch(caller, { person_ids, message }, deps) {
  const ids = normalizeIds(person_ids);
  if (!ids.length) {
    return { results: [], completed: 0, failed: 0, error: 'person_ids required' };
  }
  if (ids.length > MAX_BATCH) {
    return {
      results: [],
      completed: 0,
      failed: 0,
      error: `person_ids exceeds maximum of ${MAX_BATCH}`,
    };
  }
  const text = String(message || '').trim();
  if (!text) {
    return { results: [], completed: 0, failed: ids.length, error: 'message required' };
  }

  const results = await mapPool(ids, CONCURRENCY, async (personId) => {
    try {
      const company = await isCompanyId(personId, deps);
      if (!company) {
        return slotFailed(personId, PEOPLE_FAIL_REPLY);
      }
      const handled = await maybeHandle(caller, { person_id: personId, message: text }, deps);
      if (!handled) {
        return slotFailed(personId, PEOPLE_FAIL_REPLY);
      }
      let companyRow = null;
      try {
        const store = (deps && deps.db) || require('./db');
        companyRow = await store.getById(personId);
      } catch {
        companyRow = null;
      }
      return slotFromHandle(personId, handled, companyRow);
    } catch (error) {
      console.error('Airsup china batch slot failed:', error.message);
      return slotFailed(personId, null);
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

module.exports = {
  MAX_BATCH,
  CONCURRENCY,
  normalizeIds,
  mapPool,
  sendBatch,
  PEOPLE_FAIL_REPLY,
};
