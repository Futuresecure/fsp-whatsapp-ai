# FSP Connect 2.1 — Stage 7: Privacy, Retention and Incident Response Control Plan
**Status:** IMPLEMENTED PRECHECKS, POLICY APPROVAL PENDING. 30 October 2026.

## Isolation
This controls the standalone WhatsApp AI system only: `Futuresecure/fsp-whatsapp-ai` branch `dev`, its own Supabase project and staging web path. Do not alter the existing CRM, business website code, prior database or accepted 2.0 offline prototype.

## Implemented
- Read-only, service-role-only SQL function `public.fsp_retention_inventory()` enumerates aggregate age buckets at 30, 90 and 365 days for contacts, conversations, messages, webhook events, reply requests, operator audit, message status events, rate reservations and operational alerts.
- It returns no customer identity, phone number, message body, provider payload, access token, or individual record.
- `anon` and `authenticated` EXECUTE have been revoked. A currently active admin can access safe aggregate results only through `GET /api/retention-inventory`.
- Pure `privacy-core.mjs` validates categories, nonnegative monotonic age buckets and never labels a retention policy approved or deletion enabled.
- `GET /api/incident-readiness` is active-admin-only, reads open/critical internal alerts, webhook backlog and monitoring heartbeat, and returns a fixed manual incident procedure, without any action endpoint.
- Incident status is **manual attention required** for stale monitoring, unknown metrics, any open incident, critical incident, or webhook backlog. If clear it reports **no current incident detected**, which is NOT equivalent to response plan approval.
- Admin Settings includes **Check Retention Inventory** and **Check Incident Readiness** read-only controls.
- CI tests exercise authorization, source-data redaction, age-bucket constraints, incident staleness and no-send/no-delete guarantees.

## Actual retention/erasure policy: owner sign-off PENDING
The 30/90/365-day values are **observational buckets only**, NOT default deletion periods or recommendations. Before an approved deletion engine is implemented, the owner and qualified privacy/legal reviewer should document:
1. The purpose and lawful basis for collecting contact metadata, message contents, operator notes, webhook payload and AI knowledge.
2. Opt-in, opt-out, customer access/correction/deletion requests, legal holds and exceptions.
3. Per-record-class retention periods and whether statutory, dispute, insurance or audit obligations require different periods.
4. Who can initiate/approve erasure, who must verify backups, how incidents are documented, and what audit trail (without unnecessary PII) must remain.
5. Deletion cascading effects across conversations, attachments, outbound ledger, rate limits, status records, analytic reports and message retries.
6. Safe behavior for backups and offline exports when a deletion is approved.
7. A tested staging-only dry-run and owner sign-off before any bulk deletion or scheduled purging.

No such policy is approved in this release. Do **not** schedule automatic deletion, disable RLS or write customer data to GitHub.

## Incident handling runbook (manual)
**Detection**: Admin opens Settings → Operational Alerts and Incident Readiness. Internal cron runs every 5 minutes; stale heartbeat must be treated as a problem even with zero open alerts.

**Triage**:
- Record occurrence time (UTC), incident coordinator, observed scope and feature (inbound webhook, manual reply, Meta provider status, permissions, suspected disclosure, database integrity).
- Classify effect on customer data, delayed messages, duplicate sends and any regulatory/privacy exposure.
- Avoid copying personal data or API tokens into chats, public GitHub issues or reports.

**Containment**:
- For possible unauthorized/duplicate outbound messaging, authorized admin disables **only** the standalone FSP project's test send flag after confirming the appropriate runbook.
- Do not automatically retry a Meta send with an uncertain outcome. Inspect the durable ledger and actual provider status.
- For stolen credentials: revoke/rotate secrets using authorized owner access, review connected sessions and app permissions; do not put new keys into source code.
- Preserve webhook events, outbound idempotency requests, operator audits and status events for investigation. Do not delete these during active investigation.

**Recovery**:
- Verify recovery material and independently restored environment first; Stage 6 synthetic replay is not a real backup.
- Restore to the same standalone FSP system only after change-control and owner authorization; never restore over existing CRM or previous database.
- Confirm RLS, admin access, incoming webhooks, message status reconciliation, alert heartbeat and approval limits.
- Authorize customer pilot only after independent regression tests and documented observation.

**Closure**:
- Record root cause, start/end times, affected systems, remediation, customer/regulator notification assessment as appropriate, evidence preservation window, approval and follow-up controls.
- Do not automatically close privacy/security incidents merely because one alert disappears.

## Non-implemented / pending
- No automatic email/WhatsApp/mobile alert paging: internal monitoring only.
- No named backup owner, incident coordinator or tested out-of-hours response.
- No approved privacy policy, customer erasure workflow, automated retention rule or legal-hold control.
- No verified full external backup or isolated independent restore.
- No independent multi-operator login acceptance.
- GitHub repository currently public; decide privacy/hosting implications before changing visibility.
- Supabase Auth Advisor warns that leaked-password protection is disabled.
- Test-number-only WhatsApp sending unchanged; production customer sending, AI auto reply and broadcast remain OFF.

## Suggested acceptance evidence
- User confirms both new Admin Settings check buttons render.
- 9/9 Stage 7 automated safety tests pass; GitHub Actions deployment succeeds.
- Live SQL shows 9 age-bucket categories and `anon/authenticated` cannot EXECUTE RPC.
- Simulated incident scenarios validated without mutating production messages, contacts, or secrets.
- Formal privacy/retention and incident policies, real restore and controlled pilot require separate owner sign-off.
