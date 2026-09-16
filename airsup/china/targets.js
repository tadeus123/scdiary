const MAX_TARGETS = 1000;

function stripPrefix(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (lower.startsWith('conversation:')) return s.slice('conversation:'.length).trim();
  if (lower.startsWith('factory:')) return s.slice('factory:'.length).trim();
  if (lower.startsWith('person:')) return s.slice('person:'.length).trim();
  return s;
}

function dedupeTargets(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const id = stripPrefix(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
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
 * Normalize send_message args into { targets, message, error? }.
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
    if (conversationId) targets = dedupeTargets([conversationId]);
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

function isConversationTarget(id) {
  const raw = String(id || '').trim();
  return raw.startsWith('cn_') || raw.toLowerCase().startsWith('conversation:');
}

module.exports = {
  MAX_TARGETS,
  stripPrefix,
  dedupeTargets,
  normalizeSendArgs,
  isConversationTarget,
};
