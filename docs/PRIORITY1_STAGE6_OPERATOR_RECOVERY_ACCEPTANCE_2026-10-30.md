# FSP Connect 2.1 — Priority 1 Stage 6: Multi-Operator QA and Backup/Recovery Preflight
Assessment: 30 October 2026
Release decision: PARTIAL ACCEPTANCE — Stage 6 code/tests deployed; full production release remains NO-GO.

## 1. Strict isolation and no sending
- Project: standalone Futuresecure/fsp-whatsapp-ai (dev), dedicated Supabase vzcpzhobtfwhurcsppdl.
- Existing CRM, legacy database, website application and accepted frozen 2.0 prototype were not changed.
- Test-recipient-only manual WhatsApp replies remain restricted; production customer sending, AI Auto Reply and Broadcast remain OFF.
- No Meta send, contact import, automated campaign or live customer change was performed in this stage.

## 2. Multi-operator security QA
- Extracted reusable role policy into supabase/functions/fsp-connect-staging-api/operator-permissions.mjs.
- Runtime enforces current server-side fsp_operators role and active status, not user-editable user_metadata.
- Workspace-wide conversation read and assignment: active admin/manager only.
- Assigned agent: read/modify/reply only for matching assigned_to. No assignment, no unrelated conversation access.
- Viewer: read-only assigned conversation; cannot reply, mark read, resolve, take over, assign, add notes or use admin endpoints.
- Inactive/invalid identity: denied.
- Admin-only operational monitoring, production gates, recovery diagnostics and operator coverage remain privileged.
- CI role-policy test suite: eight tests across admin, manager, assigned agent, unassigned agent, viewer, inactive account, spoofed user metadata and unknown production action.
- Admin-only GET /api/operator-coverage returns role counts ONLY, no personal names, phone numbers or tokens.
- Only ONE active admin existed at assessment. Real separate authenticated sessions for the five roles have NOT been tested; live multi-account QA gate stays NOT VERIFIED.

## 3. Database security
- 15 project-specific tables examined; 15/15 RLS enabled.
- All project-specific data tables/views examined lack direct SELECT permission for anon and authenticated. The private conversation view is service-role-only, security-invoker.
- Added explicit deny-client RLS policies to private monitoring tables. Security Advisor 'RLS Enabled No Policy' INFO finding cleared.
- Database advisor still reports 'Leaked Password Protection Disabled' WARN. No change to Supabase Auth provider settings.
- New service-role-only read-only RPC public.fsp_recovery_integrity_check() for small relational preflight; anon and authenticated EXECUTE denied. It does not export/backup or restore data.

## 4. Backup/Recovery integrity evidence
- Database inventory of 15 FSP application tables recorded, with:
  contacts 1; conversations 1; messages 3; outbound requests 1; operators 1;
  webhook events 6; operator audits 3; message status events 4;
  AI settings/flows/sessions/execution events 0.
- Referential checks: 0 messages without conversations, 0 conversations without contacts, 0 outbound requests without conversations, 0 rate reservations without ledger request, 0 audit events without operator.
- A safe TEMP TABLE synthetic replay/recovery rehearsal was run inside BEGIN/ROLLBACK, with fabricated contact, conversation and message. Creation, temporary copy, removal, replay, foreign-key and content validation PASS. The complete reproducible SQL is tests/stage6-synthetic-recovery-rehearsal.sql.
- No real customer data exported. No external backup file was created. No isolated external database was restored. These two important production gates remain NOT VERIFIED.
- New admin-only GET /api/recovery-preflight checks relational references and row counts, explicitly outputs backup_artifact_verified=false and independent_restore_verified=false.
- On-screen read-only 'Run Recovery Preflight' and 'Check Operator Coverage' controls in Settings.
- Database migrations:
  20261030063553_stage6_monitoring_explicit_deny_client_rls;
  20261030063844_stage6_read_only_recovery_integrity_preflight.

## 5. Verification evidence
- Node automated tests for operator permission matrix, safe aggregate operator counts and honest recovery status.
- CI additionally rejects anonymous API requests to operator coverage/recovery endpoints and checks JavaScript syntax.
- Existing WhatsApp 3 messages, 1 outbound ledger request, 1 conversation, 1 contact unchanged. 0 webhook backlog, 0 open alerts at verification.
- Staging Edge API version 19 after deployment, webhook remains v7; GitHub Pages deployment succeeds. (See actual Actions history for latest run.)
- Frontend browser acceptance still requires a logged-in admin verifying both Stage 6 panels.

## 6. True disaster recovery still pending
- Confirm Supabase organization's plan and backup entitlement in the Supabase Dashboard; tool access here does not surface a verified usable backup artifact or PITR restore point.
- Supabase official docs describe daily dashboard backups for Pro/Team/Enterprise, and recommend regular off-site logical dumps for Free projects. Plan-specific availability must be verified.
- Create a restricted, encrypted off-site logical backup including schema, data, RLS, migration versions and separate storage objects as applicable.
- Record backup timestamp, checksum, protected storage location, retention period and recovery owner without committing any customer data or credentials to public GitHub.
- Independently restore to a separately authorized isolated environment. This may involve paid branch/project compute; cost approval required beforehand.
- Validate row counts, PK/FK integrity, operator grants, RLS, cron schedules, media/storage linkage and application functionality. Record actual RTO/RPO and sign-off.
- Never call restore_project against the live FSP project as a test: that can overwrite live data.
- Explicit owner approval is required before non-test customer pilots and production sending.

## 7. Remaining security and release blockers
- Only one active admin: real independent operator-session testing remains pending.
- No verified off-site backup / real independent recovery drill.
- Supabase Auth leaked-password protection warning remains unresolved.
- GitHub source repository is currently PUBLIC; review appropriate privacy setting, token history and hosting impact.
- Data retention/deletion, full incident response, load testing, controlled real-customer pilot and owner sign-off still pending.
- Stage 6 code-level tests and safe integrity preflight do NOT by themselves authorize a production launch.

## 8. User browser acceptance
1. Open https://futuresecureproviders.com/fsp-whatsapp-ai/staging-web/ and hard refresh.
2. Navigate to Settings, click Check Operator Coverage; expect Admin=1, other roles=0, independent-session QA NOT VERIFIED.
3. Click Run Recovery Preflight; expect counts and zero orphans, but backup and independent restore NOT VERIFIED.
4. Confirm test replies still require the allowlisted recipient; do not change production sending settings.
