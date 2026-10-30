-- Stage 7: read-only retention inventory. No deletion or archiving is authorized.
-- Only aggregates over the isolated FSP Connect database; never returns message text or PII.
CREATE FUNCTION public.fsp_retention_inventory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $inventory$
WITH samples AS (
 SELECT 'contacts'::text AS category, created_at AS observed_at FROM public.whatsapp_contacts
 UNION ALL SELECT 'conversations',created_at FROM public.whatsapp_conversations
 UNION ALL SELECT 'messages',created_at FROM public.whatsapp_messages
 UNION ALL SELECT 'webhook_events',received_at FROM public.fsp_webhook_events
 UNION ALL SELECT 'reply_requests',created_at FROM public.fsp_outbound_requests
 UNION ALL SELECT 'operator_audit',created_at FROM public.fsp_operator_audit
 UNION ALL SELECT 'message_status_events',created_at FROM public.fsp_message_status_events
 UNION ALL SELECT 'reply_rate_reservations',created_at FROM public.fsp_reply_rate_events
 UNION ALL SELECT 'operational_alerts',first_seen_at FROM public.fsp_operational_alerts
), categories AS (
 SELECT unnest(ARRAY[
 'contacts','conversations','messages','webhook_events','reply_requests',
 'operator_audit','message_status_events','reply_rate_reservations','operational_alerts'
 ]) AS category
), summary AS (
 SELECT k.category,
  count(s.observed_at)::int AS total,
  count(s.observed_at) FILTER(WHERE s.observed_at<now()-interval '30 days')::int AS older_30_days,
  count(s.observed_at) FILTER(WHERE s.observed_at<now()-interval '90 days')::int AS older_90_days,
  count(s.observed_at) FILTER(WHERE s.observed_at<now()-interval '365 days')::int AS older_365_days
 FROM categories k LEFT JOIN samples s ON s.category=k.category
 GROUP BY k.category
)
SELECT jsonb_build_object(
 'scope','standalone_fsp_connect',
 'assessed_at',now(),
 'categories',(SELECT jsonb_agg(jsonb_build_object(
  'category',category,'total',total,'older_30_days',older_30_days,
  'older_90_days',older_90_days,'older_365_days',older_365_days
 ) ORDER BY category) FROM summary),
 'retention_policy_approved',false,
 'automatic_deletion_enabled',false,
 'legal_hold_review_complete',false,
 'backup_retention_review_complete',false,
 'production_privacy_ready',false
);
$inventory$;
REVOKE ALL ON FUNCTION public.fsp_retention_inventory() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_retention_inventory() TO service_role;
COMMENT ON FUNCTION public.fsp_retention_inventory() IS 'Read-only, server-only WhatsApp retention age bucket inventory. NO DELETE and no policy approval.';
