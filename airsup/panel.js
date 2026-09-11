const { otherOf } = require('./conversations');

const THREADS_URI = 'airsup://conversations';
const THREAD_PREFIX = 'airsup://conversations/';

function personBrief(person) {
  if (!person) return { person_id: '', name: 'Someone' };
  return {
    person_id: person.person_id || '',
    name: person.display_name || person.email || 'Someone',
  };
}

async function listThreads(store, callerPersonId) {
  const rows = await store.listConversationsForPerson(callerPersonId);
  const threads = [];
  for (const conv of rows) {
    const otherId = otherOf(conv, callerPersonId);
    const other = otherId ? await store.getPerson(otherId) : null;
    const messages = await store.listMessages(conv.conversation_id);
    const last = messages[messages.length - 1];
    threads.push({
      conversation_id: conv.conversation_id,
      status: conv.status,
      other: personBrief(other),
      preview: last ? String(last.body || '').slice(0, 80) : '',
      updated_at: conv.updated_at,
    });
  }
  return threads;
}

async function conversationPanel(store, callerPersonId, conversationId, opts) {
  const you = personBrief(await store.getPerson(callerPersonId));
  const threads = opts && opts.includeThreads === false ? [] : await listThreads(store, callerPersonId);
  const id = String(conversationId || '');
  const conv = id ? await store.getConversation(id) : null;
  if (!conv || !otherOf(conv, callerPersonId)) {
    return {
      conversation_id: id,
      status: '',
      you,
      other: null,
      messages: [],
      threads,
    };
  }
  const other = personBrief(await store.getPerson(otherOf(conv, callerPersonId)));
  const rows = await store.listMessages(id);
  const messages = rows.map((row) => ({
    from: row.from_person_id === callerPersonId ? 'you' : 'them',
    name: row.from_person_id === callerPersonId ? you.name : other.name,
    body: String(row.body || ''),
    at: row.created_at,
  }));
  return {
    conversation_id: conv.conversation_id,
    status: conv.status,
    you,
    other,
    messages,
    threads,
  };
}

function threadsResource() {
  return {
    uri: THREADS_URI,
    name: 'Your Airsup conversations',
    title: 'Your Airsup conversations',
    description: 'Read-only list of Airsup conversations for the signed-in person.',
    mimeType: 'application/json',
  };
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

async function conversationResourceContents(store, callerPersonId, uri) {
  const requested = String(uri || '');
  if (requested === THREADS_URI) {
    return jsonContents(THREADS_URI, { threads: await listThreads(store, callerPersonId) });
  }
  if (requested.startsWith(THREAD_PREFIX)) {
    const conversationId = requested.slice(THREAD_PREFIX.length);
    return jsonContents(requested, await conversationPanel(store, callerPersonId, conversationId));
  }
  return { contents: [] };
}

function isPublicResource(uri) {
  return String(uri || '').startsWith('ui://widget/');
}

module.exports = {
  THREADS_URI,
  THREAD_PREFIX,
  conversationPanel,
  listThreads,
  threadsResource,
  conversationResourceContents,
  isPublicResource,
};
