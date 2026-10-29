# FSP Connect 2.1 — Stage B2 restricted manual replies

Stage B2 builds a manual reply path behind fail-closed staging controls; **no sending is enabled by deployment**.

Meta API Setup screenshot (2026-10-29): App ID 809254711889670; WhatsApp number +91 93637 05905, Phone Number ID `1248446071686225`, WhatsApp Business Account ID `922433197569331`, Graph API `v26.0`. This is the EXISTING app/number.

Required before any test sending:
- Create **Meta system user** token in Business Settings with required WhatsApp account and app access and `whatsapp_business_messaging` (plus `whatsapp_business_management` for account management). Temporary Generate Access Token in Meta API Setup is unsuitable for long-lived integration.
- Set **server-side only** secrets: `FSP_META_ACCESS_TOKEN`, `FSP_META_PHONE_NUMBER_ID`, `FSP_META_TEST_RECIPIENT`.
- Leave `FSP_META_SENDING_ENABLED` UNSET. Enabling requires an explicit testing go/no-go decision, controlled test recipient, signed-in permitted operator, and an inbound message within the 24-hour customer-service window. This app will not send to any number outside the staging allowlist.
- Register approved callback URL/verify token in Meta only during the agreed cutover and after prior automation is stopped. Do not change existing callback during code rollout.

Runtime safety:
- Admin/Manager, or Agent assigned to the conversation only; Viewer excluded.
- Verify Supabase JWT fresh on each call; never accept user-provided phone or provider id as a send target.
- Require incoming customer message in last 24h; staging allowlist and explicit enabled flag; no templates/marketing/AI/broadcast.
- Validate text <=4096 chars and cryptographic UUID idempotency key. Save claim before POST Meta Graph API; duplicate key rejected, no automatic retries after ambiguous result.
- Store accepted message in whatsapp_messages so the status ledger can reconcile status callbacks. Keep an audit record with no message text.
- Secrets never appear in browser HTML or GitHub. Existing webhook remains unchanged until cutover.

Staged development scope: Code and tests may be merged and an inactive edge function deployed. The existing public dashboard continues read-only until Meta access credentials and a controlled test workflow are ready.