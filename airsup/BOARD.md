# Board copy (do not rewrite)

Source of truth: [Miro board uXjVHq5vFU8=](https://miro.com/app/board/uXjVHq5vFU8=/)

Copied from the board. When implementing MCP tools and the Gmail trigger, use these strings **verbatim**. Do not paraphrase titles, descriptions, schemas, or the endpoint prompt.

| File | Board item |
|---|---|
| `tools/find_people.json` | Doc “1. find_people” |
| `tools/send_message.json` | Doc “2. send_message” |
| `tools/end_conversation.json` | Doc “3. end_conversation” |
| `prompts/endpoint-gmail-trigger.txt` | Text “Instructions:” on Anna’s Gmail trigger |

MCP tools/list must expose only these three tools, in this order: `find_people`, `send_message`, `end_conversation`.

The lowercase “information explaining who this person is…” on `matches[].description` is as written on the board. Keep it. Per match, only `person_id` and `name` are required; `description` is optional.

How to interpret identity, conversation ids, Gmail fallback, and source of truth: `CANONICAL.md`.

Full contract: `SPEC.md`.
