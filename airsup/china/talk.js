const db = require('./db');
const { endpointRecord, companyTitle } = require('./fields');
const { sendInquiryNotice } = require('./mail');

function formatReply(company, message, caller) {
  const record = endpointRecord(company);
  const name = companyTitle(company, 'en');
  const callerName = (caller && (caller.display_name || caller.email)) || 'Airsup buyer';
  const lines = [
    `${name} (verified supplier endpoint, ${record.city || 'China'}, ${record.niche || 'manufacturing'}, domain ${company.domain})`,
    '',
    'This endpoint answers only from the factory’s published capabilities. Private/internal data is not included.',
    '',
    record.listing_text,
    '',
    record.goal ? `Endpoint goal: ${record.goal}` : '',
    record.action_labels && record.action_labels.length
      ? `Allowed actions: ${record.action_labels.join('; ')}`
      : '',
    '',
    `Buyer (${callerName}) asked: ${message}`,
    '',
    'How to answer:',
    '- Use only the capabilities listed above. Do not invent machines, certificates, prices, capacity or lead times.',
    '- If the job is likely a poor fit, say so and stop.',
    '- For a usable RFQ, you need: quantity, material, tolerance/finish, target date, destination, and drawings (STEP/PDF) if it is a custom part.',
    '- If any of those are missing, ask for them before treating this as a complete inquiry.',
    '- If the buyer wants a quote, sales contact, call or factory visit, record that and it will be emailed to the factory’s verified mailbox.',
  ];
  return lines.filter((line) => line !== '').join('\n');
}

async function maybeHandle(caller, args) {
  const personId = String((args && args.person_id) || '').trim();
  if (!personId || !db.isConfigured()) return null;
  if (String((args && args.conversation_id) || '').trim()) return null;
  const company = await db.getById(personId);
  if (!company || company.status !== 'live') return null;
  const message = String((args && args.message) || '').trim();
  if (!message) {
    return { conversation_id: '', status: 'failed', reply: null };
  }
  const reply = formatReply(company, message, caller);
  await db.insertInquiry({
    company_id: company.company_id,
    caller_person_id: caller && caller.person_id ? caller.person_id : null,
    message,
    reply,
  });
  sendInquiryNotice({
    company,
    message,
    callerName: caller && (caller.display_name || caller.email),
  }).catch((error) => {
    console.error('Airsup china inquiry mail failed:', error.message);
  });
  return {
    conversation_id: '',
    status: 'replied',
    reply,
  };
}

module.exports = {
  formatReply,
  maybeHandle,
};
