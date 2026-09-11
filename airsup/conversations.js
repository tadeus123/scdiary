function otherOf(conv, personId) {
  if (conv.participant_a === personId) return conv.participant_b;
  if (conv.participant_b === personId) return conv.participant_a;
  return null;
}

function failed(conversationId) {
  return { conversation_id: conversationId || '', status: 'failed', reply: null };
}

function ended(conversationId) {
  return { conversation_id: conversationId, status: 'ended', reply: null };
}

function createConversations({ store, mailer, sleep }) {
  const pause = sleep || (() => new Promise((resolve) => setTimeout(resolve, 400)));

  async function waitForOutcome(conversationId, personId) {
    for (;;) {
      const conv = await store.getConversation(conversationId);
      if (!conv || conv.status === 'ended') return ended(conversationId);
      if (conv.parked_for === personId) {
        const reply = conv.parked_text;
        const patch = {
          parked_for: null,
          parked_text: null,
        };
        if (conv.inflight === personId) patch.inflight = null;
        await store.updateConversation(conversationId, patch);
        return { conversation_id: conversationId, status: 'replied', reply };
      }
      await pause();
    }
  }

  async function sendWake(conv, message, callerPersonId) {
    const otherId = otherOf(conv, callerPersonId);
    const recipient = await store.getPerson(otherId);
    const caller = await store.getPerson(callerPersonId);
    if (!recipient || !String(recipient.email || '').trim()) {
      throw new Error('Recipient has no Gmail');
    }
    await mailer.sendWakeEmail({
      to: recipient.email,
      conversationId: conv.conversation_id,
      message,
      caller,
    });
    await store.updateConversation(conv.conversation_id, { wake_sent_at: new Date().toISOString() });
  }

  async function sendMessage(callerPersonId, args) {
    const message = String((args && args.message) || '').trim();
    let personId = String((args && args.person_id) || '').trim();
    let conversationId = String((args && args.conversation_id) || '').trim();
    if (!message) return failed(conversationId);
    if (personId && conversationId) {
      const existing = await store.getConversation(conversationId);
      if (existing) personId = '';
      else return failed(conversationId);
    }
    if (Boolean(personId) === Boolean(conversationId)) return failed(conversationId);

    if (personId) {
      if (personId === callerPersonId) return failed('');
      const recipient = await store.getPerson(personId);
      if (!recipient || !String(recipient.email || '').trim()) return failed('');
      const conv = await store.insertConversation({
        participant_a: callerPersonId,
        participant_b: personId,
        status: 'open',
        unmatched_from: callerPersonId,
        unmatched_text: message,
        inflight: callerPersonId,
      });
      await store.insertMessage({
        conversationId: conv.conversation_id,
        fromPersonId: callerPersonId,
        body: message,
      });
      try {
        await sendWake(conv, message, callerPersonId);
      } catch {
        return failed(conv.conversation_id);
      }
      return waitForOutcome(conv.conversation_id, callerPersonId);
    }

    const conv = await store.getConversation(conversationId);
    if (!conv) return failed(conversationId);
    if (conv.status === 'ended') return failed(conversationId);
    const other = otherOf(conv, callerPersonId);
    if (!other) return failed(conversationId);

    if (conv.parked_for === callerPersonId) {
      const reply = conv.parked_text;
      const patch = { parked_for: null, parked_text: null };
      if (conv.inflight === callerPersonId) patch.inflight = null;
      await store.updateConversation(conversationId, patch);
      return { conversation_id: conversationId, status: 'replied', reply };
    }

    if (conv.unmatched_from === callerPersonId) {
      if (!conv.wake_sent_at) {
        try {
          await sendWake(conv, conv.unmatched_text || message, callerPersonId);
        } catch {
          return failed(conversationId);
        }
      }
      await store.updateConversation(conversationId, { inflight: callerPersonId });
      return waitForOutcome(conversationId, callerPersonId);
    }

    if (conv.inflight === callerPersonId) return failed(conversationId);

    await store.insertMessage({
      conversationId,
      fromPersonId: callerPersonId,
      body: message,
    });

    if (conv.unmatched_from === other) {
      await store.updateConversation(conversationId, {
        unmatched_from: null,
        unmatched_text: null,
        parked_for: other,
        parked_text: message,
        inflight: callerPersonId,
      });
      return waitForOutcome(conversationId, callerPersonId);
    }

    await store.updateConversation(conversationId, {
      unmatched_from: callerPersonId,
      unmatched_text: message,
      parked_for: other,
      parked_text: message,
      inflight: callerPersonId,
    });
    return waitForOutcome(conversationId, callerPersonId);
  }

  async function endConversation(callerPersonId, conversationId) {
    const id = String(conversationId || '').trim();
    const conv = await store.getConversation(id);
    if (!conv) return { conversation_id: id, status: 'ended' };
    if (!otherOf(conv, callerPersonId)) return { conversation_id: id, status: 'ended' };
    await store.updateConversation(id, {
      status: 'ended',
      ended_at: new Date().toISOString(),
      unmatched_from: null,
      unmatched_text: null,
      inflight: null,
    });
    return { conversation_id: id, status: 'ended' };
  }

  return { sendMessage, endConversation };
}

module.exports = {
  createConversations,
  otherOf,
};
