# FSP Connect 2.1 — Existing resources audit (2026-10-29)

## Confirmed, existing infrastructure

- Private GitHub repository: Futuresecure/fsp-whatsapp-ai. Branches: main (README only), dev (preview and planning assets).
- Existing Supabase: fsp-whatsapp-ai, ref vzcpzhobtfwhurcsppdl, region ap-south-1, ACTIVE_HEALTHY.
- Existing seven tables: whatsapp_contacts, whatsapp_conversations, whatsapp_messages, ai_agent_settings, chatbot_flows, chatbot_sessions, chatbot_execution_events.
- All seven have RLS enabled and explicit deny_client_access policies for anon and authenticated roles. Backend-only database access is the present design.
- Existing three migrations: initial_whatsapp_ai_secure_schema; explicit_deny_client_access_policies; chatbot_flow_engine_schema.
- Zero Auth users, zero Edge Functions, zero rows in these seven tables at audit.
- Security Advisor: no lints. Performance Advisor reports unused indexes on new/empty tables; do not drop without usage evidence.
- Do not create a second repository or Supabase project.

## Do not disturb

- Do not alter accepted FSP Connect 2.0.
- Do not alter public website, CRM, or CRM database.
- Keep main unchanged; use existing dev for new code.
- Do not store real credentials or customer data in repository.
- Do not weaken deny-client policies merely to make a frontend read the tables.

## Gaps / next implementation stages

- No production backend, queue, Auth users, operator authorization, deployed staging or Meta connection exists yet.
- Existing public tables cover core contacts, messages and flows. Campaigns, template status history, consent audit, durable webhook inbox and operator authorization require reviewed schema design; do not add duplicates.
- This Stage A only introduces a safe local webhook challenge + signature validation. Signed POST events deliberately receive 503 until durable storage/idempotency is ready.
- Next: Auth/RBAC design, durable event inbox and worker, test-number integration in staging, approved UI migration, then controlled live messages.
