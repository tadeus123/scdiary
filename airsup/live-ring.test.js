require('dotenv').config();
const assert = require('assert');
const crypto = require('crypto');
const { supabase } = require('./db');
const { MCP_URL } = require('./config');

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function mcp(name, args) {
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || 'MCP error');
    err.payload = json.error;
    throw err;
  }
  const data = json.result && json.result.structuredContent;
  if (!data) {
    throw new Error(`No structuredContent from ${name}: ${JSON.stringify(json).slice(0, 400)}`);
  }
  return data;
}

async function insertEndpoint(label) {
  const token = crypto.randomBytes(24).toString('hex');
  const row = {
    google_id: `airsup-live-${label}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    display_name: label,
    endpoint_email: `${label.replace(/\s+/g, '-').toLowerCase()}@example.invalid`,
    mcp_token: token,
    help_with: 'live protocol test',
    need_help_with: 'live protocol test',
    desired_person: 'live protocol test',
    active: true,
    contactable: true,
    card_approved: false,
  };
  const { data, error } = await supabase.from('airsup_endpoints').insert(row).select('*').single();
  if (error) throw error;
  data._token = token;
  return data;
}

async function main() {
  if (!supabase) fail('Supabase is not configured locally');

  const created = [];
  let callId = '';
  try {
    const initRes = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'live-ring', version: '1' } },
      }),
    });
    const init = await initRes.json();
    const version = init.result && init.result.serverInfo && init.result.serverInfo.version;
    console.log('mcp_version', version);
    assert.ok(version >= '2.5.0', `expected MCP 2.5.0+, got ${version}`);

    const caller = await insertEndpoint('LiveTestCaller');
    const callee = await insertEndpoint('LiveTestCallee');
    created.push(caller.endpoint_id, callee.endpoint_id);

    const found = await mcp('find_people', {
      token: caller._token,
      query: 'LiveTestCallee',
    });
    assert.strictEqual(found.do_not_invent, true);
    const match = (found.matches || []).find((row) => row.name === 'LiveTestCallee');
    assert.ok(match && match.match_id, `find_people missed callee: ${JSON.stringify(found).slice(0, 500)}`);
    assert.ok(!match.endpoint_id, 'find_people must not return endpoint_id');
    console.log('find_people', 'ok', found.matches.length);

    const prepared = await mcp('prepare_call', {
      token: caller._token,
      match_id: match.match_id,
      opening: 'live ring protocol check',
    });
    assert.ok(prepared.confirmation_id);
    assert.strictEqual(prepared.must_confirm, true);
    console.log('prepare_call', 'ok');

    const started = await mcp('confirm_call', {
      token: caller._token,
      confirmation_id: prepared.confirmation_id,
    });
    assert.ok(started.call && started.call.call_id);
    assert.ok(started.email && started.email.subject.includes('[A2A-RING]'));
    assert.ok(started.email.body.includes('PICKUP:'));
    assert.ok(started.email.body.includes('No token needed'));
    callId = started.call.call_id;
    console.log('confirm_call', callId, started.call.status);

    const again = await mcp('confirm_call', {
      token: caller._token,
      confirmation_id: prepared.confirmation_id,
    });
    assert.ok(again.email && again.email.body.includes('PICKUP:'), 'reused ring must still return a doorbell');
    console.log('confirm_call_reuse_doorbell', 'ok');

    const ringBogus = await mcp('handle_ring', {
      token: 'this-is-not-a-valid-airsup-token',
      subject: started.email.subject,
      body: started.email.body,
    });
    assert.ok(ringBogus.line_token, 'handle_ring must ignore a leftover token and use the RING');
    console.log('handle_ring_bad_token', ringBogus.call.status);

    await mcp('hang_up', { token: caller._token, call_id: callId });
    await mcp('hang_up', { line_token: ringBogus.line_token, call_id: callId });
    await supabase.from('airsup_call_messages').delete().eq('call_id', callId);
    await supabase.from('airsup_calls').delete().eq('call_id', callId);

    const prepared2 = await mcp('prepare_call', {
      token: caller._token,
      match_id: match.match_id,
      opening: 'subject only pickup',
    });
    const started2 = await mcp('confirm_call', {
      token: caller._token,
      confirmation_id: prepared2.confirmation_id,
    });
    callId = started2.call.call_id;
    const ringSubject = await mcp('handle_ring', {
      subject: started2.email.subject,
      body: '',
    });
    assert.ok(ringSubject.line_token, 'handle_ring must work from the subject if the body is empty');
    console.log('handle_ring_subject_only', ringSubject.call.status);

    const calleeSync = await mcp('session_sync', {
      line_token: ringSubject.line_token,
      call_id: callId,
      since_seq: 0,
      wait_ms: 0,
      message: 'callee on the line',
    });
    assert.ok(calleeSync.line_token);
    const calleeSpeech = (calleeSync.new_from_other || []).map((row) => row.body).join(' ');
    assert.ok(calleeSpeech.includes('subject only pickup'), `callee missed opening: ${calleeSpeech}`);
    console.log('callee_session_sync', 'ok');

    const callerSync = await mcp('session_sync', {
      token: caller._token,
      call_id: callId,
      since_seq: 0,
      wait_ms: 0,
    });
    const callerSpeech = (callerSync.new_from_other || []).map((row) => row.body).join(' ');
    assert.ok(callerSpeech.includes('callee on the line'), `caller missed callee: ${callerSpeech}`);
    console.log('caller_session_sync', 'ok');

    await mcp('hang_up', { token: caller._token, call_id: callId });
    await mcp('hang_up', { line_token: calleeSync.line_token, call_id: callId });
    console.log('live ring protocol passed');
  } finally {
    if (callId) {
      await supabase.from('airsup_call_messages').delete().eq('call_id', callId);
      await supabase.from('airsup_calls').delete().eq('call_id', callId);
    }
    if (created.length) {
      await supabase.from('airsup_endpoints').delete().in('endpoint_id', created);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
