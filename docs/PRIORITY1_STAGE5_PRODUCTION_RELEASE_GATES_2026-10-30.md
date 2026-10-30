# FSP Connect 2.1 — Priority 1 Stage 5 Production Release Readiness
Audit date: 30 October 2026

## Deployment scope and isolation
- Dedicated GitHub repository: Futuresecure/fsp-whatsapp-ai (dev).
- Dedicated Supabase project: vzcpzhobtfwhurcsppdl.
- Staging site is under /fsp-whatsapp-ai/staging-web/ on the existing domain. Its code, backend and database remain separate.
- The frozen accepted FSP Connect 2.0 prototype, existing CRM and previous database are out of scope.
- This release does NOT authorize or enable production customer sending, AI auto replies, templates or broadcast.

## Implemented Stage 5
- New read-only admin-only GET /api/production-gates.
- Server fetches live restricted-application evidence: active operator count, historical inbound count, webhook backlog, operational critical incidents, monitoring heartbeat, staging recipient allowlist presence and durable rate event storage availability.
- Pure fail-closed evaluator /release-gates.mjs classifies PASS, BLOCKED and NOT VERIFIED and always reports production_ready=false and can_enable_production=false.
- New Settings panel 'Production Go-Live Gates — Stage 5' with a manual button to inspect all results. The UI cannot approve or enable sending.
- Gates requiring external evidence are explicitly blocked/unverified, regardless of otherwise healthy metrics.
- Automated unit tests cover stale/missing heartbeat, no operators, backlog, critical alerts, missing data, duplicate gate IDs, source-data privacy, no go-live bypass.
- API integration QA requires a 401 on anonymous access.

## Mandatory outstanding release gates
1. Real-world multi-operator authorization testing: admin, manager, assigned agent, unassigned agent and viewer with independent sessions. Current project currently has one active admin; SQL transaction simulations do not count as live multi-account acceptance.
2. Approved backup method and a test restore into a separate, isolated environment. No backup artifact or successful restore is claimed by this release.
3. Supabase Auth leaked-password protection warning must be reviewed and remediated as supported by the selected plan.
4. GitHub repository visibility is PUBLIC and requires an explicit source/privacy review before production.
5. Approved contact privacy, retention, deletion, access audit and incident response rules.
6. Controlled non-test customer pilot explicitly approved and observed, with 24-hour window, templates as applicable, sending consent rules, rollback and support coverage.
7. Dedicated production sender route, quality/rate limits, security tests and production ownership sign-off. Production route does not currently exist.
8. Browser acceptance for the new Production Go-Live Gates panel.

## Backup/restore safety procedure (not yet executed)
- Review Supabase project's actual backup entitlement and retention under its current plan in its own Dashboard. Do not assume PITR or a daily snapshot exists.
- Plan encrypted database export or provider-managed backup covering only this isolated project, including migrations, schemas, role policies and customer-related tables as legally appropriate.
- Keep backups outside public GitHub and protected with restricted access and a documented deletion period.
- Restore into a separately authorized isolated test database/project, never into the old CRM database.
- Compare table counts, RLS policies, known conversation/message references, webhook event status and monitoring jobs.
- Do not restore over the active staging database and do not treat SQL transaction rollback tests as a backup/restore drill.
- Separate project/branch creation may incur charges and therefore requires prior owner authorization.
- Only a completed documented restore test can change the gate from NOT VERIFIED.

## Security observations
- API authenticates against Supabase Auth /auth/v1/user on each request and checks active FSP operator role in its own database.
- Current 24-hour restricted reply endpoint remains on exact recipient allowlist with idempotency and database rate reservations.
- Private operational alert storage and RLS remain unchanged.
- Source/history credential scanner and Stage 4 monitoring remain in CI.
- Repository visibility was not changed and no credentials were copied to GitHub.

## Rollback & release policy
- A release gate report is diagnostic, not an approval.
- For emergency test-sending stop, administrator may disable the FSP-specific sending secret in the isolated Supabase project. Never modify unrelated CRM/website secrets.
- Roll back only the standalone staging frontend and Edge function to a previously verified revision; keep database migrations, message records and audit history.
- A formal GO decision requires each mandatory release gate to have independent evidence and an explicit owner sign-off. Until then: NO GO.
