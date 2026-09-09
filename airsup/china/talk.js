const db = require('./db');
const { endpointRecord, companyTitle } = require('./fields');
const { sendInquiryNotice } = require('./mail');

function formatReply(company, message, caller) {
  const record = endpointRecord(company);
  const name = companyTitle(company, 'en');
  const callerName = (caller && (caller.display_name || caller.email)) || 'Airsup buyer';
  const lines = [
    `${name} (verified CNC endpoint, ${record.city || 'China'}, domain ${company.domain})`,
    '',
    'This is the company endpoint answering from the shop’s registered capabilities. It is not a person-to-person ChatGPT wait.',
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
    'Answer from the registered endpoint: use only the capabilities above. If a drawing, quantity, tolerance, material or destination is missing, say what is missing. Do not invent certificates, machines or lead times that are not listed.',
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
