-- Stage 9: add indexes for frequently joined foreign-key columns.
-- Already applied to the isolated fsp-whatsapp-ai Supabase project.
-- IF NOT EXISTS keeps replays safe on environments where these indexes exist.

create index if not exists fsp_contact_consent_events_operator_id_idx
  on public.fsp_contact_consent_events (operator_id);

create index if not exists fsp_operator_audit_conversation_id_idx
  on public.fsp_operator_audit (conversation_id);

create index if not exists fsp_outbound_requests_operator_id_idx
  on public.fsp_outbound_requests (operator_id);
