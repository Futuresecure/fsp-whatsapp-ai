# FSP Connect 2.1 — Stage A3/A4 Implementation

**Scope:** independent `Futuresecure/fsp-whatsapp-ai` only. Not integrated with the CRM or public site. The v2.0 accepted prototype is unchanged. All outgoing WhatsApp, broadcast, AI auto-reply and automations remain disabled.

## Architecture

- `services/api/src/server.mjs`: existing challenge/HMAC handling maintained; signed Meta webhook JSON is validated and normalized into a single atomic `fsp_enqueue_events` PostgreSQL RPC before HTTP 200. If persistence fails returns HTTP 503, never a false acknowledgement.
- `services/api/src/events.mjs`: one event per inbound message/provider status. Stable deduplication keys. No unfiltered raw Meta payload stored.
- `services/api/src/worker.mjs`: PostgreSQL lease-based claims, serial event processing with bounded retries/dead letters; `worker-cli.mjs` supports `--once` or polling. Concurrent workers use `FOR UPDATE SKIP LOCKED`.
- `supabase/migrations/20261029070000_stage_a3_a4_secure_operator_events.sql`: additive objects only. All new tables protected by RLS and revoked `anon` and `authenticated` privileges. Atomic processing + inbound contact/conversation/message transaction; status-reconciliation ledger supports status-before-message.
- `services/api/src/supabase.mjs`: privileged service operations stay on the API server; Supabase Auth verifies bearer tokens using `/auth/v1/user`. Operators must have a separately provisioned *active* record in `fsp_operators`. No public sign-up is provided.
- `services/api/src/operator.mjs`: read APIs plus restricted conversation actions with audit trail; viewers read-only; agents see *only assigned* conversations, managers/admins can see all. No outbound message endpoint exists.
- `services/api/src/auth-client.mjs`: integration adapter for later approved Inbox UI. No replacement of its navy/white design.

## Developer setup

Node.js 22+, no runtime npm dependencies. In `services/api`: `npm test`, `npm run check`.

For staging, set server-only `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `META_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`. Do not put secret keys in the browser. Configure a separate staging service for `npm start` (HTTP API) and `npm run worker:run` (durable consumer). HTTPS via reverse proxy and managed secrets are required before any public webhook. `GET /readyz` checks database access; liveness never implies readiness.

Do **not** register a live business phone or deploy the webhook to public Meta subscriptions as part of this stage. `SUPABASE_SECRET_KEY` is equivalent to privileged service role access; protect it. Disable public self-registration using Supabase Auth configuration and provision operators only after separate authorization.

## Endpoints

- `GET /healthz`, `GET /readyz`
- `GET/POST /webhooks/whatsapp` (challenge, verified inbound-only ingest)
- `GET /api/me`
- `GET /api/conversations?limit=25&offset=0`
- `GET /api/conversations/:id`
- `GET /api/conversations/:id/messages?limit=25&offset=0`
- `GET /api/contacts?limit=25&offset=0`
- `POST /api/conversations/:id/actions` with `action` among `mark_read`, `resolve`, `reopen`, `takeover`, `pause_ai`, `resume_ai`, `assign`, `note`. The `assign` action needs `operator_id`, and `note` needs `text`. Successful actions are audited.

## Manual staging QA required

1. Configure sign-in via Supabase Auth but create no real accounts until authorized; confirm expired/missing JWT is rejected.
2. Provision a *fictional* test operator with a valid Auth user in staging only, then verify Admin/Manager/Agent/Viewer endpoint matrix and IDOR denial.
3. Test webhook verification, missing/tampered signature, invalid JSON, duplicate message, concurrency, durable commit failure, worker restart and dead-letter recovery.
4. Test out-of-order delivery (`read` before `sent`), consent defaults, conversation unread counts, media metadata and notes isolation.
5. Run Supabase security advisors and ensure 7 pre-existing tables remain unchanged. Verify rollback/restore in staging.
6. Only after secure staging, configure actual Meta **test phone** with separate explicit approval. Do not activate bulk or AI replies.

## Recovery

Stop incoming routing at reverse proxy, stop worker, preserve database snapshot. For non-destructive rollback, revert API deployment first and leave additive event/role tables intact for forensic replay. A destructive database drop is **not** included. Dead-letter rows are retained for manual admin review and controlled requeue in future tooling.

## Known limitations

This code does not deploy itself, configure Supabase Auth provider settings or create operators. No real Meta calls or sandbox delivery have been verified. Status ledger catches out-of-order provider events, but live outbound sending is intentionally absent. Current Inbox UI remains the accepted standalone preview until separately wired and approved. Contact listing is scoped through a bounded 500-conversation fetch and needs a scalable database-view endpoint before high-volume launch. Automatic email/password reset redirect allow-list must be configured in Supabase Auth. Queue-based replies require configured staging infrastructure.