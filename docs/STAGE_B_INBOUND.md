# FSP Connect 2.1 — Stage B: Meta Inbound Webhook + Durable Inbox

**Stage B1 implemented:** Meta webhook receiving foundation, HMAC-SHA256 validation over unmodified request bytes, atomic Supabase queue, scheduled PostgreSQL processing, Inbox data integration. **Not live with Meta:** App Secret and verification token must still be configured; there is no test-phone subscription yet. The dashboard shows real database data only.

## Deployed staging resources

- Supabase Edge Function **`fsp-whatsapp-webhook`**, `verify_jwt=false` because Meta calls without a Supabase JWT. Every POST is instead authenticated using the Meta App Secret signature, and rejects unsigned/tampered bodies. Unconfigured endpoint fails closed with HTTP 503.
- POST `https://vzcpzhobtfwhurcsppdl.supabase.co/functions/v1/fsp-whatsapp-webhook`
- GET the same URL with `hub.mode=subscribe`, `hub.verify_token=...` and `hub.challenge=...` performs Meta verification only when configured.
- GET `?health=1` returns a non-sensitive inbound-only configuration status. It does not confirm a Meta subscription or customer messages.
- Existing Database functions `fsp_enqueue_events`, `fsp_claim_events`, `fsp_process_event` used without changing their contracts.
- `pg_cron` worker `fsp_connect_stage_b_inbound_worker` runs once per minute: `SELECT public.fsp_stage_b_drain_queue(25);`. Access revoked from public/anon/authenticated.
- Admin Inbox already reads `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages` through authenticated Edge API. No artificial customer rows are seeded.

## Required secure connection steps (not completed)

1. In **Meta for Developers**, use the approved WhatsApp Cloud API *test* app / number. Obtain **App Secret** from App Settings > Basic. Do not paste it into chat, GitHub, the website HTML, or JavaScript.
2. In **Supabase** project `fsp-whatsapp-ai` > **Edge Functions > Secrets**, set:
   - `FSP_META_APP_SECRET` = Meta App Secret (sensitive, server-side only).
   - `FSP_META_VERIFY_TOKEN` = new random 32+ character verify token that you choose locally. Retain it privately to enter in Meta verification form.
   - Optionally and preferably `FSP_META_WABA_ID` and `FSP_META_PHONE_NUMBER_ID` = your approved test WABA ID and Phone Number ID, respectively (restrict inbound scope).
3. Set the Meta WhatsApp Callback URL to the deployed `fsp-whatsapp-webhook` HTTPS URL. Use **exactly the same** verification token in Meta Dashboard. Subscribe to the WhatsApp Business Account's **messages** field in the *test app*.
4. After the GET verification succeeds, send a message to the Meta test number from a number approved for test. Check Database table `fsp_webhook_events` (queued/completed), then `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`. Allow up to one minute for scheduled processing. Refresh FSP Connect Inbox.
5. Validate repeated webhook delivery (no extra messages), an invalid signature rejection, read/delivered event reconciliation, media metadata, and dead-letter/retry monitoring before marking Meta inbound integration complete.

## Guardrails / known limitations

- **WhatsApp outgoing sending OFF; Broadcast OFF; AI Auto Reply OFF; automated message sends OFF.** No Meta Graph send-message API added.
- No actual Meta test-phone callback has been received in this stage yet; the Meta app cannot be configured from these connected development tools without its app-level credentials/configuration.
- Every POST must include `X-Hub-Signature-256: sha256=<64 hex chars>` over exact raw JSON and must be durably enqueued before HTTP 200. Returns 503 for storage outages, for retry. Bad HMAC 403, malformed JSON 400, oversized payload 413.
- Database worker scheduled as part of Stage B migration version `20261029105429`, 25 queued events per minute with 60-second leases, max 5 processing attempts and dead letters. For high throughput, revise batch size / schedule, build alerting and operations dashboards.
- Media files are **not fetched** from Meta yet; only media IDs and message type are saved. Interactive/location/other types are presently represented as type labels, not full interactive payloads.
- The webhook health endpoint reports `not_configured` until both Meta secrets are set. This is intentional.
- Do not store service_role key or App Secret in any public source file.

## Verification evidence

- Local Node.js `node --test tests/stage-b-webhook.test.mjs`: 10/10 PASS.
- Supabase migration applied. `cron.job` shows job `fsp_connect_stage_b_inbound_worker`, 1-minute schedule, active=true.
- `has_function_privilege('anon'/'authenticated', 'public.fsp_stage_b_drain_queue(integer)', 'EXECUTE')`: false; `service_role`: true.
- Database integration test in `BEGIN ... ROLLBACK`: queue → scheduled worker function → inbound message and unread count, default opt-in false; exact duplicate refused. PASS. Counts remained zero after rollback.
- Security Advisor existing warning: Leaked Password Protection disabled; unrelated to this webhook and should be reviewed.
- Live Meta signed callback is **NOT VERIFIED** until real test-app configuration and testing.

## Rollback

First remove the Meta callback subscription, then disable the dedicated cron job via `SELECT cron.alter_job(job_id, active => false)` using the actual job ID; keep event records for review. Do not delete messages or the project. Stop or redeploy the Edge Function separately. Rollback should be coordinated with pending queue processing.