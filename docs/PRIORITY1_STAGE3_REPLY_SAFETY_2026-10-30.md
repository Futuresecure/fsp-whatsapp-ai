# FSP Connect 2.1 — Priority 1 Stage 3: Restricted Reply Safety & Monitoring
Date: 30 October 2026

## Delivery status
- Supabase API `fsp-connect-staging-api` version 15 ACTIVE.
- Meta webhook `fsp-whatsapp-webhook` version 7 ACTIVE.
- Work branch: `dev` of standalone FSP Connect repository. Existing CRM, website application and frozen 2.0 prototype were not changed.
- No customer-wide sending was enabled. Reply API remains restricted to the exact approved test recipient and genuine 24-hour inbound service window.
- AI auto replies, templates, broadcast and automation sends remain OFF.

## Implemented safeguards
1. Every reply still requires a current Supabase Auth bearer JWT and an active operator record (admin, manager or agent assigned to the conversation; viewer blocked).
2. An unpredictable UUID request_id is stored in the durable `fsp_outbound_requests` ledger before any provider request; duplicates are rejected without sending.
3. Mandatory admission via service-role-only SQL RPC `fsp_reserve_reply_slot(request_id,operator_id,conversation_id)` executes AFTER the durable claim but BEFORE the Meta Graph POST. If this RPC is unavailable or denies, the provider call is NEVER attempted.
4. Atomic PostgreSQL advisory transaction locks scope operator and conversation reservations across concurrent Edge Function instances.
5. Rate policy (staging defaults): max 5 admitted replies per operator per rolling minute; max 30 per operator per rolling hour; max 12 per conversation per rolling 10 minutes; 2-second conversation cooldown. Each reservation is durable in `fsp_reply_rate_events`.
6. Rate denial returns HTTP 429 with a bounded retry_after_seconds; no message is sent. Security/admission outage returns HTTP 503 and fails closed.
7. Ambiguous Meta timeouts are NOT automatically retried to avoid duplicate delivery.
8. New admin-only read-only `GET /api/reply-operations` shows previous 24h attempt/accepted/rate-limited/unknown/persist-failed/provider-failed counts and needs-review total, without any phone number, message body or token.
9. Settings includes **Check Reply Operations** and enhanced **Check Reply Readiness** status.

## Database schema/security
- Migration `20261030054839_stage3_durable_manual_reply_rate_gate`, stored under `supabase/migrations/`.
- Rate events table has RLS enabled. PUBLIC, anon and authenticated access revoked; service_role SELECT/INSERT only.
- Rate admission SQL function SECURITY INVOKER; EXECUTE revoked from PUBLIC, anon and authenticated; granted only to service_role.
- Test with BEGIN / ROLLBACK validated 5 allowed reservations, 1 operator-minute denial, 1 same-conversation cooldown denial, and duplicate request denial.
- Independent BEGIN / ROLLBACK test validated Viewer denied, unassigned Agent denied, assigned Agent allowed. Real operator role/permissions were restored by ROLLBACK.
- No real WhatsApp message sent during this implementation and QA. Post-migration check: 0 durable rate reservations (only transaction tests), 1 historical outbound ledger request and 3 historical messages; no unresolved webhook events.

## Automated QA
- Existing Stage B2 manual reply safety tests updated for mandatory admission.
- New `tests/stage3-reply-admission.test.mjs` covers admission missing/unavailable, 429/rate limiting, unauthorized access, malformed RPC result, valid send and duplicate id.
- GitHub Stage B2 Safety and Staging API workflows passed after changes; staging web deployed.
- Live operator UI must still be manually verified in a normal browser after cache refresh.

## Limitations and production launch blockers
- All sending remains test-recipient-only; no production customer send route deployed.
- Rate policy values are staging defaults and need production traffic/budget review.
- Load/concurrency tests of independent real Edge instances not yet completed (database advisory lock design is in place).
- Additional multi-operator real-world permission QA, delivery-failure alert automation, retention policy, disaster recovery/restore drill and abuse monitoring remain pending.
- GitHub repository remains PUBLIC pending visibility/hosting review; no change to repository visibility was made.
- Supabase Security Advisor reports 'Leaked Password Protection Disabled' and requires account/admin review.
- A real controlled customer pilot needs explicit separate approval after all release gates pass. Do not remove the staging allowlist based on this release alone.

## Rollback
- Keep existing `fsp_outbound_requests`, messages and webhook events intact.
- Revert/deploy previous verified API and staging web commit if an issue occurs.
- The new table and function are additive and should not be destructively dropped during emergency rollback.
