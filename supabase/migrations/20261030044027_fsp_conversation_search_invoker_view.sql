-- Priority 1 Stage 2: server-side contact search for authorized conversations.
-- SECURITY INVOKER and no anon/authenticated grants.
CREATE VIEW public.fsp_conversation_search
WITH (security_invoker = true)
AS
SELECT
  c.id, c.contact_id, c.assigned_to, c.status, c.ai_enabled,
  c.unread_count, c.last_message_at, c.created_at,
  NULLIF(COALESCE(NULLIF(w.display_name,''), NULLIF(w.profile_name,'')), '') AS contact_name,
  w.wa_id AS contact_wa_id
FROM public.whatsapp_conversations AS c
JOIN public.whatsapp_contacts AS w ON w.id = c.contact_id;
REVOKE ALL PRIVILEGES ON public.fsp_conversation_search FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fsp_conversation_search TO service_role;
COMMENT ON VIEW public.fsp_conversation_search IS
  'Service-role-only authorized Inbox search source. Caller must apply fsp_operators role scoping.';
