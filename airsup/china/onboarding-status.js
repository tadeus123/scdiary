'use strict';

const {
  canPublish,
  publishGaps,
  qualityReady,
  normalizeProfile,
  founderWechat,
} = require('./fields');
const { isHiddenLiveDomain } = require('./public-roster');
const facts = require('./facts');

const FUNNEL_STATES = facts.FUNNEL_EVENTS.slice();

function qualityGaps(company) {
  const gaps = [];
  const profile = normalizeProfile(company && company.profile);
  if (!founderWechat(profile)) gaps.push('wechat');
  if (!String(profile.sample_lead || '').trim()) gaps.push('how_you_work');
  return gaps;
}

function pageViewedAt(allow) {
  if (!allow || allow.bounced_at) return null;
  return allow.claim_opened_at || null;
}

function deriveOnboardingStatus({ company, allow, tokens, events }) {
  const core = facts.deriveOnboardingStatus({ company, allow, tokens, events });
  if (!company) {
    return {
      ...core,
      quality_gaps: [],
      can_publish: false,
      quality_ready: false,
      page_viewed_at: null,
      email_verified_at: null,
      email_verification_sent_at: null,
      hidden_from_public_live: false,
    };
  }

  const quality = qualityGaps(company);
  return {
    ...core,
    quality_gaps: company.status === 'live' ? [] : quality,
    can_publish: canPublish(company),
    quality_ready: qualityReady(company),
    page_viewed_at: pageViewedAt(allow),
    email_verified_at: company.verified_at || null,
    email_verification_sent_at: company.last_email_at || null,
    hidden_from_public_live: isHiddenLiveDomain(company.domain),
    publish_gaps: company.status === 'live' ? [] : publishGaps(company),
  };
}

module.exports = {
  FUNNEL_STATES,
  qualityGaps,
  deriveOnboardingStatus,
  pageViewedAt,
};
