# Database Migration Source Reconciliation

Date: 30 October 2026  
Project: `fsp-whatsapp-ai` (isolated Supabase project)

## Verified live migration history

The connected Supabase project reports 15 applied migrations. The GitHub `dev` branch now tracks the 12 migration files present in `supabase/migrations/`, including Stage 9.

The Stage 9 migration `20261030085920_stage9_fk_performance_indexes.sql` has been added to source control after verifying its three index definitions against `pg_indexes`. It was already applied to the connected Supabase project; this GitHub commit does not apply it again.

## Remaining source-history gap

The live database migration history contains these three foundational migrations that are not currently present as files in the repository:

- `20261027123318_initial_whatsapp_ai_secure_schema`
- `20261027123333_explicit_deny_client_access_policies`
- `20261027130850_chatbot_flow_engine_schema`

Their exact original SQL has not been reconstructed or fabricated here. Do not claim that a clean database can be rebuilt from the repository alone, and do not run a fresh-project migration replay until the original SQL has been recovered and reviewed.

## Safety and reconciliation rule

- The connected database is the current verified staging schema.
- Existing CRM, existing website, and the old database are outside this project's scope and must not be modified.
- Do not drop or recreate live tables to make migration history appear consistent.
- Recover the three original migration files from their authoritative source or a verified database backup/schema export, review them, then add them to source control in their original version order.
- After reconciliation, compare all migration versions and schema objects before any new environment is provisioned.
