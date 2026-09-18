'use strict';

const DEFAULT_ORIGIN = 'https://www.airsup.co';

function chinaPublicOrigin() {
  return String(process.env.AIRSUP_CHINA_PUBLIC_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
}

function chinaVerifyUrl(token, next) {
  const qs = new URLSearchParams();
  qs.set('token', String(token || ''));
  if (next) qs.set('next', String(next));
  return `${chinaPublicOrigin()}/verify?${qs.toString()}`;
}

function chinaClaimUrl(token) {
  const qs = new URLSearchParams();
  qs.set('token', String(token || ''));
  return `${chinaPublicOrigin()}/claim?${qs.toString()}`;
}

function chinaLiveJsonUrl() {
  return `${chinaPublicOrigin()}/live.json`;
}

function chinaEndpointUrl(companyId) {
  return `${chinaPublicOrigin()}/api/endpoint/${encodeURIComponent(String(companyId || ''))}`;
}

module.exports = {
  chinaPublicOrigin,
  chinaVerifyUrl,
  chinaClaimUrl,
  chinaLiveJsonUrl,
  chinaEndpointUrl,
};
