# FSP Connect 2.1 — Production Release Preparation

**Prepared:** 30 October 2026  
**Repository:** `Futuresecure/fsp-whatsapp-ai`  
**Current working branch:** `dev`  
**Connected Supabase project:** `vzcpzhobtfwhurcsppdl`  
**Release decision:** **NO-GO — staging is verified; production is not provisioned or accepted.**

This document is the authoritative release gate. Passing CI or a healthy staging project does not, by itself, authorize a production deployment or customer messaging.

## 1. Scope and isolation

- This is a standalone WhatsApp AI system.
- Do not connect it to, migrate, modify, or reuse the existing FSP CRM, website application, or legacy database.
- Keep the accepted FSP Connect 2.0 offline prototype frozen.
- The current Supabase project and API are staging. Do not relabel them as production.
- No customer-wide outbound messaging, AI auto-reply, automation execution, scheduled sending, or broadcast is enabled by this release preparation.

## 2. Verified staging evidence

The connected staging database was checked on 30 October 2026:
- 15 applied migrations.
- All 16 public tables have RLS enabled.
- The three Stage 9 foreign-key indexes exist.
- Webhook backlog: 0; open alerts: 0; critical alerts: 0.
- Current snapshot: 1 active operator, 1 contact, 1 conversation, 3 messages.
- Enabled AI configurations: 0; active automation flows: 0; recorded opt-in contacts: 0.
- Stage B inbound webhook QA passed, including Meta signature validation, challenge validation, account/phone filtering, durable enqueue acknowledgement, fail-closed storage errors, body size limit, inbound-only health and secret redaction.
- Staging API Verification and Manual Reply Safety QA passed on the current verified staging baseline.

These are staging checks, not production acceptance.

## 3. Mandatory production gates

Every gate must have an evidence link or signed operator record. Unknown is not pass.

| Gate | Required evidence | Current state |
|---|---|---|
| Separate production environment | Owner-approved production Supabase project, region, billing confirmation, isolated credentials | BLOCKED |
| Database source reproducibility | Recover and review the three missing foundational migration files; verify clean-room migration replay | BLOCKED |
| Backup and restore | Encrypted independent backup, retention, restore into a separate isolated project, integrity report | BLOCKED |
| Supabase Auth hardening | Enable leaked-password protection and confirm password policy in authorized project settings | BLOCKED |
| Operator identity | Real Admin, Manager, Agent, Viewer accounts; MFA policy; invite/recovery/offboarding tests | BLOCKED |
| Authorization QA | Real sessions proving assigned/unassigned conversation access and all role boundaries | BLOCKED |
| Meta business ownership | Verified WABA, phone number, app, business permissions and webhook subscription | BLOCKED |
| Meta webhook production config | Production-only verify token and app secret stored as server-side secrets; production health and signed test event verified | BLOCKED |
| Outbound provider readiness | Correct production sender, token rotation, rate limits, idempotency, provider error/retry tests | BLOCKED |
| Template readiness | Real Meta-approved templates, locale/variables/category review and policy validation | BLOCKED |
| Consent evidence | Explicit, auditable opt-in evidence; opt-out suppression and deletion/retention checks | BLOCKED |
| AI safety | Approved model provider, key in secret store, approved knowledge sources, grounding tests, refusal/escalation and human handoff | BLOCKED |
| Automation safety | Dry-run, schedule/time-zone, duplicate prevention, pause/kill switch, retry/dead-letter and audit tests | BLOCKED |
| Broadcast safety | Segmentation, consent-only suppression, template enforcement, rate cap, preview, approval and cancellation drill | BLOCKED |
| Mobile/browser QA | Supported desktop/mobile browsers, session expiry, refresh, accessibility, upload/download and PWA checks | BLOCKED |
| Incident response | Named owner, alert destinations, on-call path, breach/complaint workflow and rollback owner | BLOCKED |
| Repository security | Decide and enforce private repository access; review Git history and Pages exposure; branch protection and required checks | BLOCKED |
| Release/rollback | Tagged immutable release, reviewed diff, deployment approval, rollback rehearsal and post-deploy smoke test | BLOCKED |
| Controlled pilot | Explicitly approved test recipients, written send window and content approval; one-at-a-time pilot evidence | BLOCKED |

## 4. Production secret inventory (never commit or paste into chat)

Store only in the production platform's secret manager:
- Supabase production URL and server-side service-role/secret key.
- Meta app secret and long random webhook verify token.
- Meta system-user access token with minimum required permissions.
- Production WABA ID and phone-number ID.
- AI provider API key, only if the AI feature is separately approved.
- Any email/notification provider credentials, only if those features are approved.

Public/publishable Supabase keys may be used in the browser. Service-role, secret API keys, Meta tokens, app secrets and AI keys must never be embedded in frontend JavaScript, committed to Git, printed in CI logs, or pasted into this chat.

## 5. Release sequence

1. Recover authoritative migration sources and complete clean-room schema replay in an isolated disposable environment.
2. Owner provisions and secures a separate production environment; keep staging unchanged.
3. Restore a verified encrypted backup into a separate target and attach the restore report.
4. Configure production Auth, operator roles, MFA policy and access tests.
5. Configure Meta webhook and run signed inbound test events using an approved test WABA/number.
6. Complete read-only template inventory, consent capture and opt-out suppression tests.
7. Complete AI/automation/broadcast dry-runs while provider sends remain disabled.
8. Complete browser/mobile QA, monitoring, incident and rollback drills.
9. Run the consolidated production preflight workflow; all required checks must pass.
10. Obtain owner approval for a restricted test-recipient pilot. Keep bulk broadcast and AI auto-send disabled.
11. Review pilot evidence, then make a separate explicit decision on any wider outbound capability.

## 6. Stop conditions

Immediately stop release progression if:
- Any secret is found in source, history, logs, browser storage or client responses.
- RLS, operator scope or opt-out suppression fails.
- Backup restore or rollback cannot be demonstrated.
- Webhook signature or account identity verification fails.
- A test unexpectedly sends a real customer message.
- AI produces an unsupported policy/coverage claim or bypasses human handoff.
- A release workflow targets the existing CRM, website application or legacy database.

## 7. Current release decision

**NO-GO.** The repository and staging backend have useful automated QA coverage, but there is no independently verified production environment, clean-room migration history, restore evidence, production operator matrix, or approved production pilot. The production preflight workflow added alongside this document is deliberately non-deploying and non-sending. It is a verification gate, not a deployment action.
