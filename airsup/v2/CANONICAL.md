# Canonical model (board + accepted corrections)

Board copy stays verbatim in `tools/` and `prompts/`. This file records how to interpret that copy. Do not treat implementation order or the live 2.5.1 stack as board facts.

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

## end_conversation

The other side that currently has a waiting `send_message` receives `status: ended`.

What happens if nobody on the other side is waiting is an implementation decision, not a board fact.

## Not board facts

- OpenAI lightweight catalog then detailed schemas: conceptual runtime behavior. Airsup must work regardless of how OpenAI loads schemas.
- Repo 2.5.1 observations are code, not Miro.
- “Implement OAuth + register first…” is an implementation recommendation, not Miro.

## Open before coding

Wake email field `person context` is ambiguous on the board. Nearby: “gets also useful user context for this person_id to send with the prompt.” That `person_id` is the recipient whose Gmail is looked up, which leans callee context, but the other party still needs to be identifiable.

Choose:

- A. Anna’s context — so Anna’s ChatGPT can act for Anna
- B. Tade’s context — so Anna’s ChatGPT knows who is contacting her
- C. both
