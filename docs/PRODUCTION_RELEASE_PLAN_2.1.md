# FSP Connect 2.1 — Production Release Preparation

**Prepared:** 30 October 2026  
**Repository:** `Futuresecure/fsp-whatsapp-ai`  
**Release candidate branch:** `release/2.1-production-candidate`  
**Staging Supabase project:** `vzcpzhobtfwhurcsppdl` (`ap-south-1`)  
**Required production region:** India — Mumbai (`ap-south-1`)  
**Release decision:** **NO-GO — production project creation is blocked by the organization's active Free-project quota.**

This document is the authoritative release gate. Passing CI or a healthy staging project does not, by itself, authorize a production deployment or customer messaging.

## 1. Scope and isolation

- This is a standalone WhatsApp AI system.
- Do not connect it to, migrate, modify, or reuse the existing FSP CRM, website application, or legacy database.
- Keep the accepted FSP Connect 2.0 offline prototype frozen.
- The current Supabase project is staging. Do not relabel it as production.
- Production must be a separate Supabase project in India Mumbai (`ap-south-1`).
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

## 3. Production provisioning result — 30 October 2026

- Required region `ap-south-1` is supported by the current provisioning interface.
- The organization-level project quote returned **$0/month** for the new project resource.
- Project creation was attempted for `fsp-whatsapp-ai-production` in the Future Secure Providers organization and `ap-south-1`.
- Supabase rejected creation because the organization has reached its maximum of **2 active Free projects**. The existing CRM and WhatsApp staging projects occupy that quota.
- No existing project was paused, deleted, upgraded, or modified. CRM and staging remain untouched.
- The owner explicitly declined upgrading the Future Secure Providers organization to Pro. No paid plan change will be attempted.
- The connected Supabase account currently exposes only the Future Secure Providers organization; no second organization is available as a no-cost destination.
- Under the current organization quota, no separate production project can be created in the required Mumbai region without changing the plan or ownership boundary. Reusing the staging project, pausing the CRM/staging project, or silently moving ownership is not an acceptable production workaround.
- Production provisioning remains blocked unless an eligible separate Mumbai project slot becomes available without a paid upgrade, or the owner later changes this decision.
- **Provisioning is blocked until the organization owner chooses a quota remedy:** upgrade the organization plan, or authorize a different organization. The latter would change the requested ownership boundary and must not be done implicitly.
- The $0/month project quote does not override the organization Free-project quota or establish the cost of upgrading the organization plan. Re-check total plan/project cost before any paid upgrade.
- Supabase's current billing FAQ gives an example of **3 default Micro projects on one Pro organization at about $45/month**: $25 Pro subscription + $30 compute - $10 compute credits. This is an estimate, not a binding quote; actual usage, compute size, taxes and billing changes may alter the invoice. See [Supabase billing FAQ](https://supabase.com/docs/guides/platform/billing-faq) and [pricing](https://supabase.com/pricing).
- Because upgrading the existing organization applies the paid plan to all projects in that organization, it would affect the CRM and staging projects' billing plan too. No upgrade was made.

## 4. Mandatory production gates

Every gate must have an evidence link or signed operator record. Unknown is not pass.

| Gate | Required evidence | Current state |
|---|---|---|
| Separate production environment | Owner-approved production Supabase project in `ap-south-1`, isolated credentials | BLOCKED — Free-project quota |
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

## 5. Production secret inventory (never commit or paste into chat)

Store only in the production platform's secret manager:
- Supabase production URL and server-side service-role/secret key.
- Meta app secret and long random webhook verify token.
- Meta system-user access token with minimum required permissions.
- Production WABA ID and phone-number ID.
- AI provider API key, only if the AI feature is separately approved.
- Any email/notification provider credentials, only if those features are approved.

Public/publishable Supabase keys may be used in the browser. Service-role, secret API keys, Meta tokens, app secrets and AI keys must never be embedded in frontend JavaScript, committed to Git, printed in CI logs, or pasted into this chat.

## 6. Release sequence

1. Resolve the Supabase organization project-quota blocker without touching the CRM or staging project.
2. Recover authoritative migration sources and complete clean-room schema replay in an isolated disposable environment.
3. Provision the separate production environment in `ap-south-1`; keep staging unchanged.
4. Restore a verified encrypted backup into a separate target and attach the restore report.
5. Configure production Auth, operator roles, MFA policy and access tests.
6. Configure Meta webhook and run signed inbound test events using an approved test WABA/number.
7. Complete read-only template inventory, consent capture and opt-out suppression tests.
8. Complete AI/automation/broadcast dry-runs while provider sends remain disabled.
9. Complete browser/mobile QA, monitoring, incident and rollback drills.
10. Run the consolidated production preflight workflow; all required checks must pass.
11. Obtain owner approval for a restricted test-recipient pilot. Keep bulk broadcast and AI auto-send disabled.
12. Review pilot evidence, then make a separate explicit decision on any wider outbound capability.

## 7. Stop conditions

Immediately stop release progression if:
- Any secret is found in source, history, logs, browser storage or client responses.
- RLS, operator scope or opt-out suppression fails.
- Backup restore or rollback cannot be demonstrated.
- Webhook signature or account identity verification fails.
- A test unexpectedly sends a real customer message.
- AI produces an unsupported policy/coverage claim or bypasses human handoff.
- A release workflow targets the existing CRM, website application or legacy database.

## 8. Current release decision

**NO-GO.** The repository and staging backend have useful automated QA coverage, but a separate production database cannot yet be provisioned because the Future Secure Providers organization has reached its two-project Free-plan limit and the owner has declined a Pro upgrade. No existing project was touched. The production preflight workflow is deliberately non-deploying and non-sending; it is a verification gate, not a deployment action.
