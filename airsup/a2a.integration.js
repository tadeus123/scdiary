require('dotenv').config();
const assert = require('assert');
const { supabase } = require('./db');
const {
  createNetworkRequest,
  createNetworkResponse,
  recordNetworkResponse,
  validateIncomingMessage,
  getNetworkResults,
} = require('./a2a');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function insertEndpoint(suffix) {
  const row = {
    google_id: `airsup-a2a-test-${suffix}-${Date.now()}`,
    display_name: `A2A test ${suffix}`,
    endpoint_email: `${suffix}@example.invalid`,
    help_with: 'test',
    need_help_with: 'test',
    desired_person: 'test',
    active: true,
    contactable: true,
    card_approved: false,
  };
  const { data, error } = await supabase.from('airsup_endpoints').insert(row).select('*').single();
  if (error) throw error;
  return data;
}

async function cleanup(ids, requestIds) {
  if (requestIds.length) {
    await supabase.from('airsup_network_messages').delete().in('request_id', requestIds);
    await supabase.from('airsup_network_requests').delete().in('request_id', requestIds);
  }
  if (ids.length) {
    await supabase.from('airsup_endpoints').delete().in('endpoint_id', ids);
  }
}

async function main() {
  if (!supabase) fail('Supabase is not configured');

  const created = [];
  const requestIds = [];
  try {
    const origin = await insertEndpoint('origin');
    const target = await insertEndpoint('target');
    created.push(origin.endpoint_id, target.endpoint_id);

    const createdReq = await createNetworkRequest({
      fromEndpoint: origin.endpoint_id,
      targetEndpoint: target.endpoint_id,
      request: 'Who can help with this actuator problem?',
    });
    requestIds.push(createdReq.request.request_id);
    assert.strictEqual(createdReq.request.status, 'waiting');
    assert.match(createdReq.email.subject, /^\[A2A-REQUEST\] /);
    assert.strictEqual(createdReq.email.send_as, 'new_message');
    assert.strictEqual(createdReq.email.do_not_use_gmail_reply, true);

    const waiting = await getNetworkResults({ endpointId: origin.endpoint_id });
    assert.strictEqual(waiting.waiting.length, 1);

    const asTarget = await validateIncomingMessage({
      thisEndpoint: target.endpoint_id,
      subject: createdReq.email.subject,
      body: createdReq.email.body,
      gmailMessageId: `gmail-req-${createdReq.request.request_id}`,
    });
    assert.strictEqual(asTarget.action, 'answer');
    assert.strictEqual(asTarget.channel, 'request_worker');

    const dupGmail = await validateIncomingMessage({
      thisEndpoint: target.endpoint_id,
      subject: createdReq.email.subject,
      body: createdReq.email.body,
      gmailMessageId: `gmail-req-${createdReq.request.request_id}`,
    });
    assert.strictEqual(dupGmail.action, 'answer');
    assert.strictEqual(dupGmail.retry, true);

    const asOriginRequest = await validateIncomingMessage({
      thisEndpoint: origin.endpoint_id,
      subject: createdReq.email.subject,
      body: createdReq.email.body,
      gmailMessageId: `gmail-wrong-${createdReq.request.request_id}`,
    });
    assert.strictEqual(asOriginRequest.action, 'ignore');

    const responseMail = await createNetworkResponse({
      thisEndpoint: target.endpoint_id,
      requestId: createdReq.request.request_id,
      answer: 'I can help with the actuator.',
      inboundMessageId: asTarget.message_id,
    });
    assert.match(responseMail.email.subject, /^\[A2A-RESPONSE\] /);
    assert.ok(responseMail.email.body.includes('MESSAGE-TYPE: RESPONSE'));
    assert.ok(responseMail.email.body.includes('RESPONSE-EXPECTED: NO'));

    const twice = await createNetworkResponse({
      thisEndpoint: target.endpoint_id,
      requestId: createdReq.request.request_id,
      answer: 'second answer',
    }).then(
      () => 'sent',
      (error) => error.message
    );
    assert.match(String(twice), /already answered/i);

    const targetSeesResponse = await validateIncomingMessage({
      thisEndpoint: target.endpoint_id,
      subject: responseMail.email.subject,
      body: responseMail.email.body,
      gmailMessageId: `gmail-res-wrong-${createdReq.request.request_id}`,
    });
    assert.strictEqual(targetSeesResponse.action, 'ignore');

    const lyingBody = responseMail.email.body.replace('MESSAGE-TYPE: RESPONSE', 'MESSAGE-TYPE: REQUEST');
    const asOrigin = await validateIncomingMessage({
      thisEndpoint: origin.endpoint_id,
      subject: responseMail.email.subject,
      body: lyingBody,
      gmailMessageId: `gmail-res-${createdReq.request.request_id}`,
    });
    assert.strictEqual(asOrigin.action, 'deliver');
    assert.strictEqual(asOrigin.channel, 'response_worker');
    assert.notStrictEqual(asOrigin.action, 'answer');

    const replySubject = await validateIncomingMessage({
      thisEndpoint: origin.endpoint_id,
      subject: createdReq.email.subject,
      body: responseMail.email.body,
      gmailMessageId: `gmail-reply-${createdReq.request.request_id}`,
    });
    assert.strictEqual(replySubject.action, 'deliver', 'kept [A2A-REQUEST] subject with RESPONSE envelope must not be answered');

    const recorded = await recordNetworkResponse({
      thisEndpoint: origin.endpoint_id,
      requestId: createdReq.request.request_id,
      answer: asOrigin.answer,
      inboundMessageId: asOrigin.message_id,
    });
    assert.strictEqual(recorded.request.status, 'answered');
    assert.strictEqual(recorded.action, 'deliver');

    const results = await getNetworkResults({ endpointId: origin.endpoint_id });
    assert.strictEqual(results.answered.length, 1);
    assert.strictEqual(results.waiting.length, 0);

    const originInbox = await getNetworkResults({ endpointId: origin.endpoint_id });
    assert.ok(!originInbox.inbox.some((row) => row.request_id === createdReq.request.request_id));

    console.log('a2a integration tests passed');
  } finally {
    await cleanup(created, requestIds);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
