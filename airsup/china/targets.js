const MAX_TARGETS = 1000;

function parseTarget(raw) {
  if (raw && typeof raw === 'object' && raw.id) {
    const id = String(raw.id || '').trim();
    if (!id) return null;
    let mode = ['conversation', 'factory', 'person', 'auto'].includes(raw.mode) ? raw.mode : 'auto';
    if (id.startsWith('cn_')) mode = 'conversation';
    return { id, mode };
  }
  const s = String(raw || '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('conversation:')) {
    const id = s.slice('conversation:'.length).trim();
    return id ? { id, mode: 'conversation' } : null;
  }
  if (lower.startsWith('factory:')) {
    const id = s.slice('factory:'.length).trim();
    return id ? { id, mode: 'factory' } : null;
  }
  if (lower.startsWith('person:')) {
    const id = s.slice('person:'.length).trim();
    return id ? { id, mode: 'person' } : null;
  }
  if (s.startsWith('cn_')) return { id: s, mode: 'conversation' };
  return { id: s, mode: 'auto' };
}

/** @deprecated use parseTarget */
function stripPrefix(raw) {
  const row = parseTarget(raw);
  return row ? row.id : '';
}

function dedupeTargets(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const row = parseTarget(raw);
    if (!row || !row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function hasLegacyAddress(args) {
  return Boolean(
    String((args && args.person_id) || '').trim()
    || String((args && args.conversation_id) || '').trim()
    || (Array.isArray(args && args.person_ids) && args.person_ids.length)
  );
}

/**
 * Normalize send_message args into { targets: [{id, mode}], message, error? }.
 * Prefer `to`; legacy person_id / person_ids / conversation_id remain aliases.
 */
function normalizeSendArgs(args) {
  const message = String((args && args.message) || '').trim();
  const toRaw = args && args.to;
  const hasTo = Array.isArray(toRaw) && toRaw.length > 0;

  if (hasTo && hasLegacyAddress(args)) {
    return {
      targets: [],
      message,
      error: 'to cannot be combined with person_id, person_ids, or conversation_id',
    };
  }

  let targets = [];
  if (hasTo) {
    targets = dedupeTargets(toRaw);
  } else if (Array.isArray(args && args.person_ids) && args.person_ids.length) {
    if (String((args && args.person_id) || '').trim() || String((args && args.conversation_id) || '').trim()) {
      return {
        targets: [],
        message,
        error: 'person_ids cannot be combined with person_id or conversation_id',
      };
    }
    targets = dedupeTargets(args.person_ids);
  } else {
    const conversationId = String((args && args.conversation_id) || '').trim();
    const personId = String((args && args.person_id) || '').trim();
    // conversation_id wins when both legacy singles are set
    if (conversationId) targets = [{ id: conversationId, mode: 'conversation' }];
    else if (personId) targets = dedupeTargets([personId]);
  }

  if (!targets.length) {
    return { targets: [], message, error: 'to (or person_id / person_ids / conversation_id) required' };
  }
  if (targets.length > MAX_TARGETS) {
    return {
      targets: [],
      message,
      error: `to exceeds maximum of ${MAX_TARGETS}`,
    };
  }
  if (!message) {
    return { targets, message: '', error: 'message required' };
  }
  return { targets, message };
}

function isConversationTarget(idOrRow) {
  const row = parseTarget(idOrRow);
  return Boolean(row && (row.mode === 'conversation' || String(row.id).startsWith('cn_')));
}

module.exports = {
  MAX_TARGETS,
  parseTarget,
  stripPrefix,
  dedupeTargets,
  normalizeSendArgs,
  isConversationTarget,
};
