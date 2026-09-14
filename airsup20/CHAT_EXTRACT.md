# Airsup20 — full chat extract

Extracted from the Cursor chat that designed and shipped Airsup20.  
Date context: 2026-09-14. Repo: `scdiary` / tademehl.com.

This document is the consolidated record of that conversation: questions, decisions, architecture, lessons from old Airsup, product notes, identity/OAuth, tools, inbox, speed, tracing, build outcome, and the connector/DB fix.

---

## 1. Starting context — site structure

### tademehl.com overall
One Express app (`server/server.js`) on Vercel with mostly isolated slices:

| Area | Path / folder | Role |
|------|----------------|------|
| Diary / home | `server/routes/diary.js`, `views/`, `public/` | Main site |
| Admin | `server/routes/admin.js` | Password admin |
| Eisenkind | `eisenkind/` | `/eisenkind` |
| Cause | `cause/` | `/cause` |
| Airsup (v1) | `airsup/` | `/airsup` — removable ChatGPT people/factory slice |
| AirCart | `aircart-addon/` | Separate sidecar, not main Express surface |
| Airsup20 | `airsup20/` | `/airsup20` — new slice (built in this chat) |

Shared: Supabase, SEO/favicons, Vercel.

### Old Airsup (`/airsup`)
- People pages: `/airsup`, `/airsup/you`, `/airsup/prompt`
- MCP: `https://www.tademehl.com/airsup/mcp`
- Tools: `find_people`, `send_message`, `end_conversation`
- People path: ChatGPT ↔ ChatGPT via **Gmail wake** + blocking wait
- China factories: same MCP, but **our OpenAI** replies in the same `send_message` call
- Isolation rule: only in `airsup/` + marked blocks in `server/server.js` + `vercel.json` includeFiles
- Tables: `airsup_*` / `airsup_china_*`

### Where MCP lives
- **One product MCP on the site was Airsup** (now also Airsup20)
- Code: Express handlers on Vercel (`@vercel/node`), not Supabase Edge Functions
- Supabase = database only
- `.cursor/mcp.json` = Cursor IDE MCPs (Supabase/Miro), not the site product

### Multiple MCPs on one Vercel project
Yes. Same Express app, different paths, e.g. `/airsup/mcp` and `/airsup20/mcp`.

Same Supabase project can hold separate table prefixes (`airsup_*` vs `airsup20_*`).

---

## 2. Naming

- Decade steps: current conceptual next product = **`airsup20`** (then later `airsup30`, …)
- Folder: `airsup20/`
- URL: `/airsup20`, `/airsup20/mcp`
- Tables: `airsup20_*`
- Env: `AIRSUP20_*` (with fallbacks to existing `AIRSUP_*` / shared secrets where useful)
- Avoid: `airsup-2`, `airsupv2`, `airsup_2` as the product name

---

## 3. Product vision (user notes + chat decisions)

### Core idea
Make the world’s **people** accessible the way Google made information accessible — collaborate, hire, buy/sell, love, travel, help, etc. **One listing per person. Everything-platform**, not separate HR/dating/eBay apps.

### UX (user-facing)
- No Airsup20 product website / dashboard / onboarding site
- User installs plugin / pastes MCP URL in ChatGPT developer mode
- OAuth to identify the user
- First use: short in-plugin onboarding (2–4 questions; adaptable from live testing)
- Listing editable entirely through ChatGPT (“put this chair up”, “I’m into tennis”)
- Can add pictures/files to listing (user attaches in ChatGPT prompt; best-effort delivery via MCP)
- Ask anything to find people (road trip Africa, chair in Shenzhen, EE hire, tango 2034, …)
- **No graphical message UI** for AI↔AI talk
- User sees **status labels** only (thinking / talking / answering / waiting…) then the **end answer**
- Inbox: “is there something in my inbox?” / proactive mention of unread
- Match → real-world connect (phone, PayPal QR, later human-only IM) — design via testing

### Layers (formal distinction — critical)
```
RAW HISTORY
  Everything Airsup20 has observed
  (messages, conversations, actions, endpoint conversations)

KNOWLEDGE
  What we currently believe is true about the user

INTENT
  What we currently believe the user wants, needs, offers, avoids, or is open to

LISTING
  What the user explicitly chooses to expose to other people/AIs
  (= user-controlled projection; NEVER simply equal to knowledge/intent)

ENDPOINT
  The AI that reasons over all of the above
  = OUR OpenAI model in front of listing + knowledge + intent + past chats + context
  NOT the user’s personal ChatGPT account

INBOX
  Human-facing queue of actionable outcomes from other people’s endpoint talks
```

### Intent sketch (target schema)
```
intent
  user_id
  type: WANT | NEED | OFFER | OPEN_TO | AVOID
  object: "competitive tango partner"
  status: latent | considering | active | committed | paused | done
  strength, confidence
  time_horizon, conditions[]
  visibility: private | anonymously_matchable | endpoint_visible | public
  source: explicit | inferred
  last_evidence_at
  embedding (later)

intent_evidence
  intent_id, conversation_id, message_id, evidence_text, timestamp
```
Evidence layer is mandatory so the system does not invent a fictional person without provenance.

### Backend flow (user mental model)
```
My ChatGPT has the plugin
  → Airsup20 sorts people
  → Every person has their own endpoint + listing
  → My ChatGPT can talk to everyone’s endpoint
  → Listing + found context + past chats feed the endpoint
```

### ChatGPT context limits
Do **not** assume Airsup20 can pull the user’s entire ChatGPT history.  
Architect around: context ChatGPT sends on tool calls + everything Airsup20 observes after.

### Speed vs huge context (resolved contradiction)
Original tension: “no compression / huge chunks” vs “laser laser fast”.

Settled principle:
```
Never compress because of UI constraints.
Never arbitrarily truncate AI-to-AI communication.
But transmit only the context that can affect the current decision.
```
- Full lossless history in storage
- **Dynamic working context** per decision
- Endpoint request gets: identity, relevant facts, relevant active intents, listing, relevant prior with this caller, raw chunks when useful — not the whole life every time

### Architecture spine
```
ChatGPT Plugin / MCP
        ↓
Vercel MCP Gateway
        ↓
Airsup20 identity + orchestration
        ↓
Supabase (airsup20_* tables)
        ↓
Endpoint Runtime
  OpenAI model + dynamic context retrieval
```

### Product experiment priority
Get people using it and test whether useful intents can be inferred without manual maintenance — live intent database of what humans are trying to make happen.

---

## 4. Agent-to-agent: learnings from old Airsup + first principles for airsup20

### What old Airsup did
| Path | Mechanism | Cost |
|------|-----------|------|
| People | `send_message` → store → **Gmail wake** other ChatGPT → block/poll until reply | Slow, fragile, both ChatGPTs must wake, dual OAuth, Vercel timeout vs long wait |
| China factories | `send_message` → **our OpenAI** over published fields → reply in **same tool result** | Faster than Gmail, but still felt slow |

### Learnings that still hold
- Airsup DB owns the conversation (not Gmail, not ChatGPT UI)
- Caller from OAuth; never trust tool-arg identity; recipient id in tools
- `conversation_id` ≠ person pair (many threads allowed)
- Few tools; don’t invent poll/timeout as protocol
- Blocking until reply is OK **if we own compute** (China pattern)
- Widget forced human-readable compression — rejected for airsup20

### Factory path still felt “insane slow” because
1. Every human turn = full ChatGPT tool round (think → call → wait → narrate)
2. Blocking OpenAI completion inside the tool (JSON mode, fat prompts)
3. Multi-turn RFQ = that stack repeated
4. Widget / panel / extra DB work on hot path
5. Human-readable prose instead of dense endpoint packets

### Airsup20 first principles for talk
```
Human ChatGPT  = remote control + natural language UX
Endpoint        = always-on Airsup20 brain (our model + retrieve)
Talk            = endpoint ↔ endpoint (our compute)
Never           = wake someone else's ChatGPT to be their endpoint
```
Generalize the **China pattern to every person**. Drop People/Gmail wake.

### Fast path shape
```
User goal in ChatGPT
  → preferably ONE tool (fulfill)
  → cheap candidate search
  → parallel probes
  → deeper internal multi-round only for top hits
  → optional inbox write
  → status trail + final human answer
```
Not: ten ChatGPT `send_message` rounds with bubbles.

### Speed principles
- One user ask → few tool calls; AI↔AI rounds **inside** Airsup20
- Two-phase: cheap filter → expensive talk
- Fat packets between AIs; thin summary for human
- No widget / no transcript UI
- Prebuilt/small working context; no N+1 thread loads
- Parallel candidate probes
- Status labels during work, not silent long blocks
- Right-sized models: tiny router/matcher first, richer pass for winners

---

## 5. Inbox / connect

Inbox = curated handoff to the human, not every AI message.

```
Other person talks to your endpoint
  → endpoint reasons over listing + intents + knowledge
  → if relevant / listing says so / endpoint judges worth it
  → inbox item for you
  → plugin: ask inbox / proactive unread mention
```

Item may include: reason, summary, connect payload (phone / WeChat / PayPal / etc. from listing), status unread|seen|acted|dismissed.

Rule: inbox wakes humans for **outcomes**, not for every AI turn.  
v0 connect = inbox + optional contact from listing; IM later.

---

## 6. Identity / OAuth decisions

### Discussion arc
1. First considered email-less UUID + recovery code  
2. User asked what Google can provide  
3. Settled on **Google OAuth** for identity (+ basic profile enrichment)

### What Google best-case can provide
- Core: `openid email profile` → stable `sub`, email, name, picture, locale  
- People extras, contacts, calendar, Gmail, Drive = more invasive / review-heavy  
- Day-one choice: **openid email profile only**; optional enrichment later  
- Do not request “everything” on first install

### OAuth without a product website
Still need a tiny authorize/consent surface.  
ChatGPT plugin OAuth + Google sign-in on a **minimal consent page** (not a dashboard).

### Two auth systems (same pattern as old Airsup, without gmail.send)
1. ChatGPT → Airsup20 plugin OAuth (PKCE) → identifies caller  
2. Google login on consent page → creates/links `airsup20_users` via `google_id`

Redirect URI to add in Google Cloud Console:
```
https://www.tademehl.com/airsup20/auth/google/callback
http://localhost:3000/airsup20/auth/google/callback
```
(Keep old `/airsup/auth/google/callback` for v1.)

Env: reuse `AIRSUP_GOOGLE_*` or set `AIRSUP20_GOOGLE_*`. Also need `SUPABASE_*`, `OPENAI_API_KEY`, session secret.

---

## 7. Files / media

User perspective: attach picture/file in ChatGPT prompt → “add to my listing”.  
Implementation: accept if host sends URL/base64/file meta into tool args; otherwise describe/link fallback.  
Do not invent a media website. Prototype with whatever ChatGPT forwards.

---

## 8. Tracing (mandatory from day one)

Every meaningful hot-path step writes accurate spans (real clocks, start before await, end in finally).

Track: gateway/auth, DB, retrieve, match, each model call, internal rounds, external APIs, any wait/retry.

- `trace_id` per tool call  
- spans with durations  
- MCP tool `get_trace` to inspect  
- Always-on instrumentation, not optional

---

## 9. Tools (locked for ship)

| Tool | Role |
|------|------|
| `me` | Profile, needs_setup, listing summary, intents, inbox_unread |
| `setup` | First-use answers + context → listing/facts/intents; mark onboarded |
| `update_listing` | Freeform listing + optional media/intents |
| `fulfill` | Main fast goal path (search → probe → deep talk → inbox → answer) |
| `get_inbox` | Read / mark seen |
| `get_trace` | Timing inspection |

No chat widget. Status via `status_labels` + OpenAI toolInvocation meta labels.

---

## 10. Database tables (`airsup20_*`)

users, listings, facts, intents, intent_evidence, raw_events, conversations, messages, inbox_items, oauth_clients, oauth_codes, plugin_tokens, traces, spans.

Service role only; RLS enabled; isolated from diary and old airsup.

**Correct production Supabase project for tademehl/Vercel:**  
`https://mvtrinbmwtpniavdcspk.supabase.co`  
(project name: tademehl.com)

---

## 11. What was built in this chat

- New isolated folder `airsup20/`
- Mount in `server/server.js` (`AIRSUP20-BEGIN/END`)
- `vercel.json` includeFiles `airsup20/**`
- Minimal consent pages at `/airsup20` (not a product site)
- MCP at `https://www.tademehl.com/airsup20/mcp`
- Google OAuth + plugin OAuth
- Endpoint runtime (`endpoint.js`) + services (`fulfill`, setup, listing, inbox, traces)
- Tests: `npm run test:airsup20`
- Revert docs/script
- Cursor rule `.cursor/rules/airsup20.mdc`
- Pushed to `origin main`

### Build intent clarification
User rejected “stub spine only”. Requirement: when building, ship the **full working thing** (connect → setup → listing → fulfill/talk → inbox → traces), still isolated and without copying old Airsup product code.

---

## 12. Incident: wrong Supabase project + ChatGPT “no actions”

### Error when creating connector
```
Dynamic client registration failed: registration endpoint returned 400
(Could not find the table 'public.airsup20_oauth_clients' in the schema cache)
```

### Root cause
First migration was applied via the wrong Supabase MCP target (`rtnfqhidjaprzablgkpk`).  
Vercel/local `.env` uses **`mvtrinbmwtpniavdcspk`**.

### Fix
Re-applied full `airsup20` schema to `mvtrinbmwtpniavdcspk` and reloaded PostgREST schema cache.  
Verified tables including `airsup20_oauth_clients`.  
Live OAuth `/airsup20/oauth/register` then returned **201**.

### “No app actions available yet” in ChatGPT connector UI
Often **normal** until you click **Refresh** in the connector Information section so ChatGPT rediscovers MCP tools.  
Live `tools/list` already returned all six tools. Tool schemas were also hardened to match working Airsup shape (`title`, `outputSchema`, `annotations`, invocation labels).

---

## 13. Explicit non-goals / dropped from v1 Airsup

- No Gmail wake loop  
- No conversation widget / human-readable AI↔AI transcript UI  
- No product website listing/onboarding pages  
- No hardcoding people as matches  
- No sharing tables with old `airsup_*`  
- No assuming full ChatGPT account history access  

---

## 14. Open / soft (called out in chat, not all fully finished)

- Exact listing field conventions (freeform; user to share more notes)
- Intent inference quality from real usage (the main product experiment)
- File/image attach reliability depends on what ChatGPT forwards
- Human-only IM channel vs phone-in-inbox (test-driven)
- Optional later Google scopes (People/Calendar) for enrichment
- Passkeys / recovery beyond Google (deferred once Google chosen)
- Continuous speed tuning using traces

---

## 15. How to operate (cheat sheet)

**Plugin URL:** `https://www.tademehl.com/airsup20/mcp`

**Google redirect URIs:**  
`https://www.tademehl.com/airsup20/auth/google/callback`  
(+ localhost variant for dev)

**Vercel env (reuse usually enough):**  
`AIRSUP_GOOGLE_CLIENT_ID/SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `SESSION_SECRET` / `AIRSUP_SESSION_SECRET`

**ChatGPT:** create connector → OAuth → on connector page click **Refresh** if actions empty → in chat ask to use airsup20 / call `me` → `setup` → `fulfill` / `update_listing` / `get_inbox`

**Remove:** `node airsup20/revert-airsup20.js` then `airsup20/sql/drop.sql`

---

## 16. Chat timeline (compressed)

1. Asked structure of tademehl + airsup  
2. Asked where MCP lives → Vercel-hosted Express, Supabase storage  
3. Confirmed multiple MCPs per Vercel/Supabase project possible  
4. Named next product airsup20 (decade steps)  
5. Described no-website, OAuth, first-use, knowledge+intent, our endpoints, store all chats, huge AI↔AI, status-only UI, laser fast  
6. Pasted ChatGPT architecture thoughts (layers, intent+evidence, dynamic context, no full ChatGPT history)  
7. Added inbox / real-world connect requirement  
8. Decided Google OAuth; discussed scopes  
9. Shared Think/Build/Test product notes (listing, discover people, no UI chat, etc.)  
10. Deep dive: old agent-talk learnings + first principles; factory slowness; tracing from day one  
11. “Go” for full working build (not stub)  
12. Built, migrated (wrong project first), pushed  
13. Connector error → fixed schema on correct Supabase project  
14. “Nothing there” / no actions → explained Refresh + verified live tools/list + hardened schemas  
15. This document: full-chat extract

---

*End of extract. This file is the single consolidated write-down of the chat as requested.*
