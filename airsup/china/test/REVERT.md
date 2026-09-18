# Revert Airsup China TEST concept (`/airsup/china/test`)

This is an isolated ChatGPT-like setup-chat concept. It does not own live china tables.

## Remove only the test concept

1. Delete the folder `airsup/china/test/`
2. Remove the marked `AIRSUP-CHINA-TEST-BEGIN` / `AIRSUP-CHINA-TEST-END` block from `airsup/china/routes.js`
3. Remove the test asserts from `airsup/china/china.test.js` that mention `/test`

Live `/airsup/china` onboarding, quotes, MCP, and demo company stay intact.
