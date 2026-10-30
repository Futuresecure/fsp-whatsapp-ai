-- Stage 6: read-only recovery integrity diagnostic. No exports or restore.
CREATE FUNCTION public.fsp_recovery_integrity_check()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp
AS $check$
SELECT jsonb_build_object(
 'scope','fsp_whatsapp_standalone',
 'contacts',(SELECT count(*) FROM public.whatsapp_contacts),
 'conversations',(SELECT count(*) FROM public.whatsapp_conversations),
 'messages',(SELECT count(*) FROM public.whatsapp_messages),
 'outbound_requests',(SELECT count(*) FROM public.fsp_outbound_requests),
 'orphan_messages',(SELECT count(*) FROM public.whatsapp_messages m LEFT JOIN public.whatsapp_conversations c ON c.id=m.conversation_id WHERE c.id IS NULL),
 'orphan_conversations',(SELECT count(*) FROM public.whatsapp_conversations c LEFT JOIN public.whatsapp_contacts w ON w.id=c.contact_id WHERE w.id IS NULL),
 'orphan_reply_requests',(SELECT count(*) FROM public.fsp_outbound_requests r LEFT JOIN public.whatsapp_conversations c ON c.id=r.conversation_id WHERE c.id IS NULL),
 'orphan_rate_reservations',(SELECT count(*) FROM public.fsp_reply_rate_events e LEFT JOIN public.fsp_outbound_requests r ON r.request_id=e.request_id WHERE r.request_id IS NULL),
 'backup_artifact_verified',false,
 'independent_restore_verified',false
);
$check$;
REVOKE ALL ON FUNCTION public.fsp_recovery_integrity_check() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_recovery_integrity_check() TO service_role;
COMMENT ON FUNCTION public.fsp_recovery_integrity_check() IS
 'Read-only, service-only FSP relational integrity diagnostic. NOT a database backup.';
