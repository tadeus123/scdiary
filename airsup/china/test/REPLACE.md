# Replace live China onboarding with `/airsup/china/test` (one PR)

The test onboarding core is `airsup/china/test/onboard.js`. It reuses live `db`, `session`, `site-preview`, `fields`, `domain`, `mail`, and `demo-company` — do not copy that logic into routes.

## Steps

1. **Point routes, keep storage**
   - In `airsup/china/routes.js`, mount or delegate signup / verify / setup / publish to helpers from `./test/onboard` (or move the helpers up one level once the UI swap is final).
   - Keep requiring `./db` and `./session` as today. Do not invent a second company table or cookie.

2. **Wire the verify link**
   - `startSignup` already returns `verifyPath` under `/airsup/china/test/verify?token=…`.
   - When going live, either keep that path and serve the new UI there, or change the path string in `onboard.js` once (single constant `VERIFY_PATH`).

3. **Sessions stay with the caller**
   - After `consumeVerifyToken(token)`, call `session.createSession(req, res, company.company_id)` in the route — the helper never sets cookies or redirects.

4. **UI swap**
   - Replace `home.ejs` / `preview.ejs` / `check.ejs` / `setup.ejs` flow with the test chat + note-web UI under `airsup/china/test/views`.
   - Map steps from `onboardingState(company, lang).step`: `site` → `email` → `verify` → `fields` → `live`.
   - Use `previewWebsite`, `saveInteraction`, `publishCompany`, `seedWebFromCompany` for scrape / fields / publish / web seed.

5. **Error keys**
   - Reuse the same i18n keys live uses: `err_mismatch`, `err_taken`, `err_free_mail`, `err_rate`, `err_email`, `err_website`, `err_mail`, `err_db`, `err_token`, `err_publish`.
   - Test `publishCompany` is stricter than live `canPublish`: it also requires WeChat + `sample_lead` (`qualityReady`) so the endpoint can convert buyers. Keep that gate when swapping live, or live endpoints stay thin.

6. **Cleanup after cutover**
   - Delete obsolete live view partials only after the new UI is the default for `/airsup/china`.
   - Leave `airsup/china/test/REVERT.md` until the concept folder itself is removed or folded in.

## Do not

- Duplicate scrape, allowlist, token, or Gmail send code in the new routes.
- Change `airsup_china_*` schema as part of the UI replace.
- Point verify emails at live `/airsup/china/verify` while the test flow is the product path — one path only.
