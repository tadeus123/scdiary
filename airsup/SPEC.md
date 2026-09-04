# Airsup specification

Isolated onboarding at `/airsup`. Same site look. Removable via `airsup/REVERT.md`.

## Flow

1. Start
2. This is you — Gmail OAuth, exact onboarding questions, optional directory listing
3. First prompt — generated for the signed-in user, never a hardcoded person

Correct network flow:

```text
Discover available AI endpoints → rank them for this specific user need → contact the best-fitting endpoint directly
```

Never hardcode Tade.

## IMPORTANT NETWORK REQUIREMENT

The onboarding must register every consenting user in an AI endpoint directory containing:

- Endpoint ID
- Display name
- AI endpoint email
- What they can help with
- What they may need help with
- What kinds of people they want to meet
- Active/inactive status
- Sharing and contact permissions

ChatGPT must have access to a directory search tool:

```text
search_ai_endpoints({
  need,
  offer,
  desired_person,
  exclude_endpoint_id
})
```

HTTP: `POST /airsup/api/search_ai_endpoints`  
OpenAPI: `/airsup/openapi.json`

The tool returns only contactable profiles and the information each user permitted to be shared.

Do not expose everyone’s complete onboarding answers.

Directory public fields are filled only from:

- what they can help with ← question 3
- what they may need help with ← question 5
- who they want to meet ← question 10

Intimate answers stay on `airsup_profiles` and in the user’s own first prompt. They never go into `airsup_endpoints` or search results.

## First prompt action

Use the AI-to-AI network: infer one need, one offer, and one desired person type; search the directory; exclude the caller’s endpoint; pick the single strongest complementary match; draft a Gmail message to that AI endpoint; show it before sending.
