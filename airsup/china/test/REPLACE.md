# China dashboard (`/airsup/dashboard`)

The onboarding core is `airsup/china/test/onboard.js`. It reuses live `db`, `session`, `site-preview`, `fields`, `domain`, and `mail` — do not copy that logic into routes.

Verify links always use `/airsup/china/verify?token=`. `/airsup/dashboard/verify` 302s there with the same token.

Signup is the same for every factory: landing scrape → sparse email → magic link → WeChat + how-you-work → dashboard. There is no demo company and no hardcoded factory.

`saveInteraction` patches contacts and how-you-work only. Spread the previous profile first so scrape, enrichment, and quotations stay.

`publishCompany` requires `qualityReady` (canPublish plus founder WeChat plus how-you-work). Thin scrapes still save and land on the dashboard as `verified`, not on the public roster.
