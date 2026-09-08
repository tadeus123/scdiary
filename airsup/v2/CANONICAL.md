# Canonical model (board + accepted corrections)

Board copy stays verbatim in `tools/` and `prompts/`. This file records how to interpret that copy. Do not treat implementation order or the live 2.5.1 stack as board facts.

The full v2 contract is [SPEC.md](SPEC.md). Spec only until that file is accepted against Miro.

## Identity

The authenticated plugin connection identifies the caller. Airsup derives `caller_person_id` from OAuth. The model must not pass the caller as a tool argument.

```text
OAuth-authenticated plugin connection
→ Airsup knows caller_person_id
```

Then:

```text
find_people(query)
send_message(person_id=RECIPIENT, ...)
end_conversation(conversation_id)
```

`send_message.person_id` is the recipient, never the sender.

Board note “every action of the plugin carries person_id” means Airsup tags the session internally. It is not a model-controlled input on every MCP call.

## Conversations

`conversation_id` is a generated unique id, not the participant pair.

```text
generate unique conversation_id

conversation_id → {
    participant_a: person_id_A,
    participant_b: person_id_B
}
```

The same two people may have many threads. `send_message(person_id=…)` starts a new conversation. `send_message(conversation_id=…)` continues one.

## Gmail wake (exact rule)

Use the trigger payload directly if it already contains `conversation_id` and the incoming message.

Otherwise use Gmail, fetch only the exact triggering message, and never read the surrounding thread.

Gmail is wake-up only. It is not the conversation channel.

## Find people output

Per match, only `person_id` and `name` are required. `description` is optional.

## Source of truth

```text
Airsup backend = source of truth for the conversation
Conversation DB = persistent conversation/message storage
Gmail = wake mechanism only
```

## Person context in the wake email

Confirmed **B / from the person that calls**: only the caller’s context (Tade in the example). Not the recipient’s listing. Not both.

## Wake From address

Confirmed: backend Gmail API, `users.messages.send`, From `tademehl@gmail.com`. No `airsup@gmail.com`, no Airsup agent mailbox.

Scope, exactly:

```text
https://www.googleapis.com/auth/gmail.send
```

Stored credential:

```text
Google OAuth refresh token for tademehl@gmail.com
```

Offline access. Backend exchanges it for short-lived access tokens. Do not request Gmail read, modify, compose, or full-mailbox scopes.

Subject contains `[AIRSUP]`. Recipient trigger: `from:tademehl@gmail.com` and `[AIRSUP]` in the subject.

While the Google OAuth app is in Testing, refresh-token lifetime is limited. That is not a permanent production configuration.

## end_conversation

The other side that currently has a waiting `send_message` receives `status: ended`.

Confirmed when nobody is waiting: persist closed, no wake email, later `send_message` on that `conversation_id` returns `status: failed` with `reply: null`. `end_conversation` itself still returns `status: ended`.

## Not board facts

- OpenAI lightweight catalog then detailed schemas: conceptual runtime behavior. Airsup must work regardless of how OpenAI loads schemas.
- Repo 2.5.1 observations are code, not Miro.
- “Implement OAuth + register first…” is an implementation recommendation, not Miro.
- Parallel `/airsup/v2/mcp` URL and Vercel wait ceiling.
