# FSP Connect 2.1 — Priority 1 Stage 4 Monitoring Acceptance
Date: 30 October 2026

## Scope & isolation
- Standalone repository: Futuresecure/fsp-whatsapp-ai, branch dev.
- Dedicated Supabase project: vzcpzhobtfwhurcsppdl.
- No change to accepted FSP Connect 2.0 prototype, existing CRM, website application or old database.
- Production customer replies, broadcast and AI automation remain OFF; existing single-recipient manual reply safety unchanged.

## Delivered
1. Private `fsp_operational_alerts` register tracks only issue type, severity, internal source UUID, timestamps, resolution and number of checks. No message text, contact phone number, Meta token, webhook payload or external notification is stored in this table.
2. Internal `fsp_monitor_heartbeat` records latest successful check.
3. `fsp_scan_operational_alerts()` detects:
   - Uncertain Meta send result / failed Inbox persistence
   - Manually claimed reply stalled beyond 10 minutes
   - WhatsApp outbound provider failure
   - Outbound status stuck in pending beyond 30 minutes
   - Permanently dead inbound webhook
   - Queued webhook older than 15 minutes or expired processing lease
4. Repeated checks deduplicate each alert by category and source ID; recovered conditions automatically change alert state to resolved.
5. PostgreSQL cron job `fsp_connect_stage4_monitor` runs every five minutes, independently of browser sessions. Existing inbound worker cron remains untouched.
6. Admin-only read-only `GET /api/operational-alerts` returns safe category labels, counts, and heartbeat freshness. Stale (>15-minute) monitor is visibly marked unhealthy, even if open alert count is zero.
7. Admin Settings includes `Refresh Operational Alerts`, with initial automatic read when the Settings page opens.
8. Supabase Edge API `fsp-connect-staging-api` v16 ACTIVE; GitHub Pages staging deployment successful.

## Security and access
- New monitoring tables have RLS enabled and no SELECT grants for anon/authenticated; only service_role has required privileges.
- Scan function SECURITY INVOKER, EXECUTE revoked from PUBLIC, anon and authenticated, granted to service_role; pg_cron runs with its privileged job owner.
- Existing API checks a fresh Supabase Auth JWT and active FSP operator. New operational alerts route additionally requires admin role.
- No source IDs, phone numbers, message bodies, tokens, credentials or provider payloads are included in the browser response.
- Admin summary does not expose actions for sending/retrying WhatsApp messages.

## QA evidence
- SQL permissions test: anon/authenticated cannot select alerts or heartbeat or invoke scan; service_role can.
- Real scanner baseline: 0 open alerts, last run recorded; cron job status succeeded.
- BEGIN/ROLLBACK simulation temporarily flagged an actual existing reply record, outbound WhatsApp record and webhook as failed. Scanner created 3 critical alerts, deduplicated repeated checks and auto-resolved after statuses returned healthy. All simulations rolled back; production customer records remained unchanged.
- Automated Node tests verify safe labels only, bounded alert lists, no PII leakage, fail-closed stale/missing monitor behavior.
- GitHub Staging API Verification workflow passes; GitHub Pages staging deployment succeeds.
- The existing 1 outbound, 2 inbound WhatsApp messages, and completed webhook records were not modified by implementation.

## Outstanding release gates
- User-browser acceptance of Admin Settings alert display after hard reload.
- Independent multi-operator credentials tests; production permissions, rate policy and controlled non-test pilot.
- Monitoring is INTERNAL only: no email, WhatsApp or push alerts if the dashboard is closed. This requires separately approved external alert integration.
- Historical backup/restore and disaster recovery drill, privacy/retention policy, security load test.
- GitHub repository public visibility review; Supabase Auth leaked-password protection remains disabled per Security Advisor.
- Full Production manual customer reply remains DISABLED intentionally.

## Rollback
- If operational alert feature fails, revert the staging UI and redeploy the prior verified API. The monitoring cron can be paused separately without stopping the existing inbound worker.
- Do not delete conversation, message, webhook, rate-admission, or audit records.
- Migration version `20261030060606_stage4_private_operational_monitor` is additive.
