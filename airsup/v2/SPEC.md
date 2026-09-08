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

Website Google login stays listing signup: `openid email profile` only. It is **not** the Gmail-send grant.

ChatGPT connector OAuth (plugin) is how Airsup knows who is calling. Register stores `person_id` next to Gmail. Connecting website or plugin auto-creates the register row if needed. They join on the same Google account email when both exist.

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

`send_message` **blocks** until the other Airsup AI replies, the conversation is ended, or the send fails. There is no pending/poll tool.

`send_message` status values (schema): `replied`, `ended`, `failed`. `reply` is the other AI’s text, or null when none was returned.

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

This mailbox grant is one backend credential. It is separate from website `openid email profile` and from ChatGPT plugin OAuth.

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
- Vercel `maxDuration` 300s: if `send_message` hits that ceiling before a reply, return `status: "failed"`, leave the conversation open, retry with `conversation_id`.
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

Implementation (not Miro):

- [ ] Parallel v2 MCP URL so 2.5.1 stays up.
- [ ] Testing vs verified production Google OAuth project for `gmail.send`.
