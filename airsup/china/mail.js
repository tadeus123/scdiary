const crypto = require('crypto');
const { GMAIL_SENDER } = require('../config');
const peopleDb = require('../db');
const { t } = require('./i18n');

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(String(subject), 'utf8').toString('base64')}?=`;
}

function rfc822({ from, to, subject, text, html }) {
  const boundary = `b${crypto.randomBytes(12).toString('hex')}`;
  const lines = [
    `From: Tade Mehl <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf8').toString('base64'),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

async function gmailAccessToken(fetchFn) {
  const grant = await peopleDb.getGmailSend();
  if (!grant || !grant.refresh_token_enc) {
    const err = new Error('Gmail is not connected.');
    err.code = 'mail';
    throw err;
  }
  const refreshToken = peopleDb.decryptSecret(grant.refresh_token_enc);
  const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AIRSUP_GOOGLE_CLIENT_ID || '',
      client_secret: process.env.AIRSUP_GOOGLE_CLIENT_SECRET || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    const err = new Error(tokenJson.error_description || tokenJson.error || 'Gmail access token failed');
    err.code = 'mail';
    throw err;
  }
  return tokenJson.access_token;
}

async function sendRaw({ to, subject, text, html, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  const accessToken = await gmailAccessToken(fetchFn);
  const raw = rfc822({
    from: GMAIL_SENDER,
    to,
    subject,
    text,
    html,
  });
  const sendRes = await fetchFn('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!sendRes.ok) {
    const err = new Error('Gmail users.messages.send failed');
    err.code = 'mail';
    throw err;
  }
}

function mailShell(inner, lang) {
  const sign = t(lang, 'mail_sign');
  const where = t(lang, 'mail_where');
  return `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4efe6;color:#1c1814;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:'PingFang SC','Microsoft YaHei',serif;">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.18em;color:#8a7348;">AIRSUP</p>
    <p style="margin:0 0 28px;font-size:12px;color:#6a6158;">${where}</p>
    ${inner}
    <p style="margin:36px 0 0;font-size:14px;">${sign}<br>tademehl@gmail.com</p>
  </div>
</body>
</html>`;
}

function verifyMail({ lang, link, contactName }) {
  const helloName = String(contactName || '').trim();
  const hello = helloName ? `${t(lang, 'mail_hello')} ${helloName}` : t(lang, 'mail_hello');
  const zh = {
    hello: helloName ? `您好 ${helloName}` : '您好',
    body: t('zh', 'mail_body'),
    button: t('zh', 'mail_button'),
    expire: t('zh', 'mail_expire'),
  };
  const en = {
    hello: helloName ? `Hello ${helloName}` : 'Hello',
    body: t('en', 'mail_body'),
    button: t('en', 'mail_button'),
    expire: t('en', 'mail_expire'),
  };
  const primary = lang === 'en' ? en : zh;
  const secondary = lang === 'en' ? zh : en;
  const inner = `
    <p style="font-size:18px;margin:0 0 16px;">${primary.hello}</p>
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">${primary.body}</p>
    <p style="margin:0 0 28px;"><a href="${link}" style="display:inline-block;background:#a32035;color:#f4efe6;text-decoration:none;padding:10px 18px;font-size:14px;">${primary.button}</a></p>
    <p style="font-size:12px;color:#6a6158;margin:0 0 28px;">${primary.expire}</p>
    <p style="border-top:1px solid #cfc4b4;padding-top:18px;font-size:14px;line-height:1.7;color:#4a453e;">${secondary.body}<br><a href="${link}" style="color:#a32035;">${secondary.button}</a><br>${secondary.expire}</p>
  `;
  const subject = lang === 'en'
    ? `${t('en', 'mail_subject')} / ${t('zh', 'mail_subject')}`
    : `${t('zh', 'mail_subject')} / ${t('en', 'mail_subject')}`;
  const text = [
    primary.hello,
    '',
    primary.body,
    link,
    primary.expire,
    '',
    secondary.body,
    link,
    '',
    'Tade Mehl',
    'tademehl@gmail.com',
  ].join('\n');
  return { subject, text, html: mailShell(inner, lang) };
}

function inquiryMail({ lang, company, message, callerName }) {
  const name = String((company && company.contact_name) || '').trim();
  const buyer = String(callerName || 'ChatGPT buyer').trim() || 'ChatGPT buyer';
  const zhBody = `有采购在 ChatGPT 里问到贵司。\n\n来自：${buyer}\n\n问题：\n${message}\n\n已按贵司填写并发布的内容作答。如需改口，请打开设置页更新内容。`;
  const enBody = `A buyer found you in ChatGPT.\n\nFrom: ${buyer}\n\nQuestion:\n${message}\n\nThe answer used the capabilities you published. Update the setup page if the answer should change.`;
  const body = lang === 'en' ? `${enBody}\n\n${zhBody}` : `${zhBody}\n\n${enBody}`;
  const subject = lang === 'en'
    ? `${t('en', 'inquiry_subject')} / ${t('zh', 'inquiry_subject')}`
    : `${t('zh', 'inquiry_subject')} / ${t('en', 'inquiry_subject')}`;
  const inner = `<p style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(body)}</p>`;
  return {
    to: company.contact_email,
    subject,
    text: `${name ? `${lang === 'en' ? 'Hello' : '您好'} ${name}\n\n` : ''}${body}`,
    html: mailShell(inner, lang),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendVerifyEmail({ lang, to, link, contactName }) {
  const mail = verifyMail({ lang, link, contactName });
  await sendRaw({ to, ...mail });
}

async function sendInquiryNotice({ company, message, callerName }) {
  if (!company || !company.contact_email) return;
  const mail = inquiryMail({
    lang: company.locale === 'en' ? 'en' : 'zh',
    company,
    message,
    callerName,
  });
  await sendRaw(mail);
}

function reasonLabel(reason, lang) {
  const zh = {
    rfq: '合格询盘，请跟进报价',
    sales_contact: '采购希望销售联系',
    call: '采购希望电话沟通',
    visit: '采购希望看厂',
  };
  const en = {
    rfq: 'Qualified RFQ to follow up',
    sales_contact: 'Buyer asked sales to make contact',
    call: 'Buyer asked for a call',
    visit: 'Buyer asked for a factory visit',
  };
  const map = lang === 'en' ? en : zh;
  return map[reason] || map.rfq;
}

function formatRfq(rfq) {
  const row = rfq && typeof rfq === 'object' ? rfq : {};
  return [
    `Qty: ${row.quantity || '-'}`,
    `Material: ${row.material || '-'}`,
    `Tolerance: ${row.tolerance || '-'}`,
    `Finish: ${row.finish || '-'}`,
    `Date: ${row.target_date || '-'}`,
    `Destination: ${row.destination || '-'}`,
    `Drawings: ${row.drawings || '-'}`,
    row.notes ? `Notes: ${row.notes}` : '',
  ].filter(Boolean).join('\n');
}

function factoryNoticeMail({ lang, company, callerName, message, reply, rfq, reason }) {
  const name = String((company && company.contact_name) || '').trim();
  const buyer = String(callerName || 'ChatGPT buyer').trim() || 'ChatGPT buyer';
  const whyZh = reasonLabel(reason, 'zh');
  const whyEn = reasonLabel(reason, 'en');
  const spec = formatRfq(rfq);
  const zhBody = `有采购在 ChatGPT 里联系到贵司。\n\n原因：${whyZh}\n来自：${buyer}\n\n询盘字段：\n${spec}\n\n最新问题：\n${message}\n\n当时的答复：\n${reply}\n\n如需改口，请打开设置页更新已发布内容。`;
  const enBody = `A buyer found you in ChatGPT.\n\nReason: ${whyEn}\nFrom: ${buyer}\n\nRFQ fields:\n${spec}\n\nLatest question:\n${message}\n\nReply given in ChatGPT:\n${reply}\n\nUpdate the setup page if the published answer should change.`;
  const body = lang === 'en' ? `${enBody}\n\n${zhBody}` : `${zhBody}\n\n${enBody}`;
  const subject = lang === 'en'
    ? `${t('en', 'inquiry_subject')} / ${t('zh', 'inquiry_subject')}`
    : `${t('zh', 'inquiry_subject')} / ${t('en', 'inquiry_subject')}`;
  const inner = `<p style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(body)}</p>`;
  return {
    to: company.contact_email,
    subject,
    text: `${name ? `${lang === 'en' ? 'Hello' : '您好'} ${name}\n\n` : ''}${body}`,
    html: mailShell(inner, lang),
  };
}

async function sendFactoryNotice({ company, callerName, message, reply, rfq, reason }) {
  if (!company || !company.contact_email) return;
  const mail = factoryNoticeMail({
    lang: company.locale === 'en' ? 'en' : 'zh',
    company,
    callerName,
    message,
    reply,
    rfq,
    reason,
  });
  await sendRaw(mail);
}

module.exports = {
  encodeSubject,
  rfc822,
  verifyMail,
  sendVerifyEmail,
  sendInquiryNotice,
  sendFactoryNotice,
  factoryNoticeMail,
};
