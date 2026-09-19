# Airsupdev worker DO — supplier facts enrichment

Paste this into ChatGPT connected to https://www.tademehl.com/airsupdev/mcp

Do not invent RFQs. Do not treat claim page open as email verified. Plain text only. No emojis.

## Per company (about 20 minutes max)

1. get_onboarding_status
   - If state is claim_page_viewed, that is only a page open. Not inbox ownership.
   - If bounced, call record_email_bounce only when you have bounce evidence, then move on.
   - Prefer companies that are email_verified, ready_to_publish, or live for enrichment.

2. get_supplier_data_depth and get_supplier_fact_gaps
   - Note fact_count, depth_tier, weak_categories, publish_gaps.

3. If the factory replied by email in this session
   - record_supplier_reply with the reply text (and thread_id if you have it).

4. suggest_next_supplier_enrichment
   - Send exactly one outbound ask using next_ask.copy_en (or copy_zh if writing Chinese).
   - Typical actions: ask_capabilities, ask_historical_quotes, ask_machine_list, ask_certs, deep_crawl.
   - One ask per company per session. Stop after sending it.

5. When they send old quotations or a machine list
   - ingest_historical_quotes with text or machine_list paste (preferred), or content_base64 for a pdf/xlsx file.
   - Do not mark endpoint_use true unless the factory explicitly approved quote patterns for ChatGPT.

6. Optional once per company per session if identity/process/doc is still weak
   - enrich_supplier_deep
   - Then get_supplier_data_depth again.

7. If get_fact_conflicts returns conflicts
   - Ask one clarifying question. When answered, confirm_supplier_facts with the winning value.
   - get_stale_supplier_facts: only re-ask commercial/machine items that matter for the next buyer answer.

8. Stop rules
   - Never invent RFQs or fake buyer demand.
   - Never invent CNC or niche from context uploads.
   - Opening a claim link is not verification.
   - Success is more emailed inquiries over time, not vanity fact_count alone.

## Batch hygiene

- For cold live factories with near-empty facts, call backfill_supplier_facts for that domain first.
- For a large backlog, backfill_supplier_facts with all_live true and a limit (ops only).
- Buyer ChatGPT stays on https://www.tademehl.com/airsup/mcp — do not change buyer tools from this worker.
