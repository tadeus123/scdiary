# Airsup v2 specification

Status: **spec only**. Do not implement until this document is compared to the Miro board and accepted.

Source layers (do not mix):

| Layer | What it is |
|---|---|
| Miro board [uXjVHq5vFU8=](https://miro.com/app/board/uXjVHq5vFU8=/) | Product source of truth |
| [BOARD.md](BOARD.md) + locked JSON/prompt files | Exact tool and endpoint copy |
| This file + [CANONICAL.md](CANONICAL.md) | How to interpret the board, plus confirmed decisions |
| Live repo 2.5.1 | Current code. Not Miro. Leave it running. |

Tool schemas and the Gmail-trigger instructions are **verbatim** from the board. Do not paraphrase them in MCP `tools/list` or on the v2 prompt page.

---

## 1. Product

Airsup lets one person’s ChatGPT find another listed person and talk to their ChatGPT. Gmail only wakes the other ChatGPT. The conversation lives in Airsup.

Three MCP tools only, in this order:

1. `find_people`
2. `send_message`
3. `end_conversation`

Exact definitions: [tools/find_people.json](tools/find_people.json), [tools/send_message.json](tools/send_message.json), [tools/end_conversation.json](tools/end_conversation.json).

The website stays: `/airsup` (landing), `/airsup/you` (listing), `/airsup/prompt` (copy-paste prompts). Isolation: Airsup code only under `airsup/`, marked `AIRSUP-BEGIN/END` in `server/server.js`, and `airsup/**` in `vercel.json`. No diary imports. No fake Google login. Do not hardcode Tade as a match.

---

## 2. Identity

```text
OAuth-authenticated plugin connection
→ Airsup knows caller_person_id
```

```text
find_people(query)
send_message(person_id=RECIPIENT, ...)
end_conversation(conversation_id)
```

- `send_message.person_id` is the **recipient**.
- The caller is never a tool argument.
- Board wording that every plugin action “carries `person_id`” means Airsup tags the authenticated session internally.

These are **two different authorization systems**. They do not share tokens, scopes, or grants:

```text
1. ChatGPT → Airsup plugin OAuth
   Identifies the calling ChatGPT user to Airsup.
   Produces caller_person_id.
   Does not send Gmail.

2. tademehl@gmail.com gmail.send OAuth
   Backend-only grant to send wake email.
   Scope exactly https://www.googleapis.com/auth/gmail.send
   Stores: Google OAuth refresh token for tademehl@gmail.com
   Does not identify ChatGPT users.
```

Website Google login is a third, smaller grant (`openid email profile` only) for listing signup. It is not plugin identity and not `gmail.send`.

ChatGPT connector OAuth is how Airsup knows who is calling. Register stores `person_id` next to Gmail. Connecting website or plugin auto-creates the register row if needed. They join on the same Google account email when both exist.

---

## 3. Register

Register holds personal context for a person: `person_id` from plugin OAuth, Gmail from website signup, listing answers from `/you`. Context is personal, not a generated generic card.

`find_people` searches that register. Per match, `person_id` and `name` are required. `description` is optional.

Do not use `find_people` on the Gmail-woken endpoint. The conversation is already established.

---

## 4. Conversations

```text
generate unique conversation_id

conversation_id → {
    participant_a: person_id_A,
    participant_b: person_id_B
}
```

The id is not the pair. The same two people may have many threads. `send_message(person_id=…)` starts a new conversation. `send_message(conversation_id=…)` continues one.

```text
Airsup backend = source of truth for the conversation
Conversation DB = persistent conversation/message storage
Gmail = wake mechanism only
```

`send_message` **blocks** until the other Airsup AI replies, the conversation is ended, or the send cannot be completed. There is no pending/poll tool. Timeout-and-retry is **not** part of the MCP protocol. The three tools stay exactly `find_people`, `send_message`, `end_conversation`.

`send_message` status values (schema): `replied`, `ended`, `failed`. `reply` is the other AI’s text, or null when none was returned.

`failed` means this send cannot complete (unknown ids, conversation already closed, wake mail could not be sent). It is not the designed way to wait for a slow reply.

### Synchronous wait (protocol)

The wait is the protocol. Hosting must hold `send_message` until `replied` or `ended` (or a true `failed`). Do not use Vercel request time limits as the conversation loop. Run v2 waiters on a long-lived process so a normal Anna delay does not return `failed`.

### Late reply after an infrastructure-dead wait

If the waiter’s HTTP/process still dies after the outbound message was accepted, the conversation stays open. That death is an accident, not a fourth tool.

State:

```text
accepted outbound from A to B remains unmatched
waiter process for A is gone
conversation stays open
```

If B then `send_message`s:

- That body is the reply to A’s unmatched outbound.
- It is stored (parked) for A.
- B’s invocation then blocks for A’s next turn, same as a normal turn.

A collects by calling `send_message(conversation_id, message)` again (schema still requires `message`):

- If a parked reply for A exists: return `status: "replied"` and that `reply` immediately. Do **not** append this invocation’s `message` as a new outbound. Drain first.
- If no parked reply yet and A still has an unmatched outbound: **resume the wait**. Do not insert a duplicate outbound and do not send another wake email.
- Only after the unmatched outbound has been answered may A’s `message` start a new turn.

Do not instruct ChatGPT to treat timeout+retry as the live loop. Prefer that A never sees `failed` from wait lifetime at all.

### Confirmed: ending when nobody is waiting

Board: if the other side has a waiting `send_message`, that waiter unblocks with `status: "ended"`.

Confirmed when nobody is waiting:

- `end_conversation` still returns `{ conversation_id, status: "ended" }`.
- Persist the conversation as closed.
- Do not send a wake email.
- A later `send_message` on that `conversation_id` returns `status: "failed"`, `reply: null`.

---

## 5. Wake email (sender architecture)

Canonical:

```text
All wake emails are sent from tademehl@gmail.com via Gmail API by backend code.
Recipient ChatGPT triggers listen for Airsup-marked emails from tademehl@gmail.com.
```

```text
Tade ChatGPT
→ Airsup send_message
→ backend code
→ Gmail API users.messages.send
→ FROM tademehl@gmail.com
→ recipient Gmail trigger wakes their ChatGPT
```

Not in this design:

- no `airsup@gmail.com`
- no Airsup agent mailbox
- no human sending the mail
- not “without any backend”

Backend function:

```text
send_wake_email(to, subject, body)
```

Subject contains `[AIRSUP]`.

Recipient ChatGPT Gmail trigger:

```text
new Gmail
from = tademehl@gmail.com
subject contains [AIRSUP]
```

Board email body:

```text
conversation_id
users prompt: xyz
person context: xyz
from the person that calls
```

**Person context = caller only** (Tade in the example). Not the recipient’s listing. Not both.

Confirmed: **first wake only.** Gmail is sent only when `send_message` starts a conversation with `person_id`. Continuations with `conversation_id` do not send mail. Both ChatGPTs must stay in their blocking `send_message` runs for later turns.

Ten sender bullets (canonical):

1. Wake mail is not the conversation; Airsup backend is source of truth.
2. No central Airsup mailbox and no Airsup Gmail agent.
3. Backend `send_wake_email(to, subject, body)` sends via Gmail API.
4. From address is always `tademehl@gmail.com`.
5. That requires a dedicated Google OAuth grant for that account, with offline access.
6. Store the refresh token in the backend, never in ChatGPT and never in git.
7. Subject always contains `[AIRSUP]`.
8. Recipient trigger: from `tademehl@gmail.com` and `[AIRSUP]` in the subject.
9. Email body: `conversation_id`, the user prompt, caller person context only.
10. Website user OAuth is not this grant; do not ask every listed person for Gmail send.

### Gmail-send OAuth (confirmed)

Scope, exactly:

```text
https://www.googleapis.com/auth/gmail.send
```

That is enough for `users.messages.send`. Do not request `gmail.compose`, `gmail.modify`, `gmail.readonly`, or `mail.google.com`.

Stored credential:

```text
Google OAuth refresh token for tademehl@gmail.com
```

Offline access enabled. Backend exchanges the refresh token for a short-lived access token when it sends. Only accept the Google account `tademehl@gmail.com`.

Deployment note (not a product rule): while the Google OAuth app is in **Testing**, refresh-token lifetime is limited. Do not treat Testing as permanent production. Production should use a verified OAuth project for this sensitive scope. Separate testing and production OAuth projects.

This mailbox grant is authorization system 2. It does not identify ChatGPT users. ChatGPT→Airsup plugin OAuth is authorization system 1. Do not combine them into one Google login.

---

## 6. Gmail trigger instructions (callee ChatGPT)

Use [prompts/endpoint-gmail-trigger.txt](prompts/endpoint-gmail-trigger.txt) **verbatim**.

Summary of that board text (do not replace the file with this summary):

- Gmail is wake-up only. Do not reply through Gmail.
- Use the triggering event directly if it already contains `conversation_id` and the incoming message.
- Otherwise fetch **only** the exact triggering message. Never read the surrounding thread.
- Airsup is source of truth.
- Act for the account owner. Use authorized tools when they are useful. Do not invent results.
- For Airsup: only `send_message` and `end_conversation`. Do not `find_people`. Always that `conversation_id`.
- `send_message` returns the other ChatGPT’s next response; continue until the objective is done.
- When complete, `end_conversation`. If the other side ends first, stop.

Add to the v2 prompt page (not a rewrite of the board block): trigger filter `from:tademehl@gmail.com` and subject contains `[AIRSUP]`.

---

## 7. Caller ChatGPT loop

User types in ChatGPT. After `find_people`, start with `send_message(person_id, message)`. Then keep using the returned `conversation_id`. `send_message` waits for the other AI. Continue until the objective is done, then `end_conversation`. A second person (e.g. Tom) is a new `person_id` and a new conversation.

Visual plugin UI (board): live back-and-forth, who you are talking to, switch if several, user end button, optional user message into the live thread. If ChatGPT only shows generic tool cards, do not invent extra tool fields. Keep the three schemas exact. A widget is allowed only if the connector host supports it.

---

## 8. What is not Miro

Labelled so they are not treated as board facts:

- OpenAI lightweight catalog then detailed schemas: conceptual runtime behavior. Airsup must work either way.
- Live MCP 2.5.1 (`https://www.tademehl.com/airsup/mcp`, `prepare_call`, `session_sync`, `handle_ring`, token-in-prompt): current code. Leave it until cutover.
- Implementation order (OAuth + register first, then conversation manager, etc.).
- New MCP URL path (recommended: `https://www.tademehl.com/airsup/v2/mcp`) and `airsup_v2_*` tables.
- v2 waiters on a long-lived host so blocking `send_message` is not capped by Vercel `maxDuration`.
- v2 prompt on a separate URL until `/airsup/prompt` is switched.

---

## 9. Isolation and cutover

- Do not change 2.5.1 tool descriptions or `/airsup/prompt` until cutover.
- Do not commit `views/partials/edu-theme-toggle.ejs`.
- Do not change favicons.
- Do not edit the Miro board from this spec.

---

## 10. Assumption checklist (compare to Miro before coding)

Board / already locked:

- [ ] Three tools only; exact titles, descriptions, schemas, annotations.
- [ ] Caller identity from plugin OAuth, not a `person_id` tool argument.
- [ ] `send_message.person_id` = recipient; `conversation_id` starts only as a new unique id.
- [ ] Blocking `send_message`; Gmail is not the conversation.
- [ ] Callee endpoint prompt verbatim; `find_people` forbidden on that worker.
- [ ] Trigger: use payload if complete; else one Gmail read of that message only.
- [ ] Email body: `conversation_id`, user prompt, person context of **the person that calls**.
- [ ] Website remains; register = person_id + Gmail + personal listing context.
- [ ] Visual conversation UI as board intent; not extra MCP tools.

Confirmed off-board (product decisions):

- [ ] Wake From = `tademehl@gmail.com` via backend Gmail API, not `airsup@gmail.com`.
- [ ] Scope exactly `https://www.googleapis.com/auth/gmail.send`.
- [ ] Stored credential = Google OAuth refresh token for `tademehl@gmail.com`.
- [ ] Subject marker `[AIRSUP]`.
- [ ] Idle `end_conversation` → later `send_message` is `failed`.
- [ ] ChatGPT→Airsup OAuth and `tademehl@gmail.com` `gmail.send` are two authorization systems.
- [ ] Blocking wait is long-lived; timeout+retry is not the protocol.
- [ ] If a waiter process dies: park B’s reply; A’s next `send_message(conversation_id, …)` drains or resumes, and does not duplicate the outbound.
- [ ] First wake only: Gmail is sent only for `send_message(person_id)`. Later turns stay in the two blocking runs.

## 11. Architecture simulation (remaining breaks)

Happy path (works): Tade plugin-OAuth → `find_people` → `send_message(person_id)` → **one** wake Anna `[AIRSUP]` from `tademehl@gmail.com` → Tade blocks → Anna Gmail trigger → `send_message(conversation_id)` with plugin-OAuth as Anna → Tade unblocks `replied` → Anna then blocks → Tade sends on `conversation_id` → Anna unblocks → `end_conversation` unblocks the waiter with `ended`.

Confirmed: **first wake only.** Only the first `send_message(person_id=…)` may send Gmail. Later turns must happen inside the same two blocking runs. No second `[AIRSUP]` mail when someone has no waiter. No wake to collect a parked reply.

That makes the endpoint prompt’s “continue this back-and-forth until the objective is done” load-bearing. If Anna’s Gmail-worker run or Tade’s chat run stops, later turns do not start themselves.

### Break 1 — a run that stops is a dead conversation

With first-wake-only, if Anna’s worker hits an OpenAI run limit, user stop, or error, she has no waiter and will not be emailed again. Tade’s next `send_message(conversation_id)` waits until he `end_conversation`s or that wait is killed. Same if Tade’s chat is gone and a reply is parked for him: nobody wakes Tade.

This is accepted protocol, not a missing email. Recovery is only: that person opens ChatGPT and calls `send_message(conversation_id, …)` again (drain/resume). There is no `list_conversations` tool.

### Break 2 — ChatGPT may drop the blocking tool call

A long-lived Airsup process does not help if ChatGPT’s MCP client times out `send_message`. Drain/resume only works if that ChatGPT calls the tool again in the **same** run. OpenAI constraint.

### Break 3 — Gmail worker without plugin OAuth

Callee `send_message` is identified only by ChatGPT→Airsup OAuth. If the Gmail automation runs without that connector login, Airsup cannot know Anna. The Gmail-triggered run **must** use the account owner’s Airsup plugin OAuth.

### Break 4 — two Gmail triggers, two Annas

The one wake can still fire twice. Two workers can both `send_message` on the same `conversation_id`. Need: at most one in-flight `send_message` per `(conversation_id, person_id)`. A second concurrent call from the same person returns `failed`. Strict turn-taking: only one unmatched outbound in the conversation.

### Break 5 — no `list_conversations`

A new ChatGPT chat does not know `conversation_id`. `send_message(person_id)` starts a **new** thread. Board “switch chats” needs widget/session memory.

### Break 6 — mail fail then `person_id` retry

If the conversation is created and then `users.messages.send` fails, a later `send_message(person_id)` starts another conversation. Retry after mail failure must use the same `conversation_id` and resend that **first** wake, not `person_id`.

### Break 7 — callee listing is not in the wake email

Chosen: caller context only. Anna’s ChatGPT acts from the ChatGPT account, not from her `/you` listing.

### Not a protocol bug

Website OAuth vs plugin OAuth vs `gmail.send` are three grants. `failed` after idle `end_conversation`. Self-`send_message` should `failed`. Do not list people with no Gmail as contactable for inbound wake.


