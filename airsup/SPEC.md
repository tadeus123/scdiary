# Airsup

Live protocol. Public URLs are `/airsup/*` only. Implementation modules live under `airsup/v2/` (not a second stack).

MCP: `https://www.tademehl.com/airsup/mcp`

Google callback: `/airsup/auth/google/callback`

Full contract: [v2/SPEC.md](v2/SPEC.md). Locked tool JSON and Gmail endpoint copy: [v2/tools/](v2/tools/) and [v2/prompts/endpoint-gmail-trigger.txt](v2/prompts/endpoint-gmail-trigger.txt). Miro: [uXjVHq5vFU8=](https://miro.com/app/board/uXjVHq5vFU8=/).

Three tools: `find_people`, `send_message`, `end_conversation`. Caller identity is ChatGPT→Airsup plugin OAuth. `send_message.person_id` is the recipient. `send_message` blocks until reply, end, or true failure. First `send_message(person_id)` may send one wake email; later turns stay on blocking `send_message`.
