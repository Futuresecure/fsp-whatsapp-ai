-- Live DDL snapshot, read-only reporting; service_role-only permissions.
CREATE OR REPLACE FUNCTION public.fsp_analytics_summary(p_operator_id uuid, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_role text; v_result jsonb; v_days integer;
BEGIN
 v_days:=greatest(1,least(coalesce(p_days,30),90));
 SELECT role INTO v_role FROM public.fsp_operators WHERE user_id=p_operator_id AND active=true;
 IF v_role IS NULL OR v_role NOT IN ('admin','manager','agent','viewer') THEN
  RETURN jsonb_build_object('ok',false,'error','unauthorized');
 END IF;
 WITH visible_conversations AS(
   SELECT c.id,c.contact_id,c.created_at
   FROM public.whatsapp_conversations c
   WHERE v_role IN ('admin','manager') OR c.assigned_to=p_operator_id
 ),
 recent_messages AS(
   SELECT m.id,m.direction,m.provider_status,m.created_at
   FROM public.whatsapp_messages m JOIN visible_conversations v ON v.id=m.conversation_id
   WHERE m.created_at>=now()-(v_days||' days')::interval
 ),
 daily AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
   count(*)::int AS all_count,
   count(*) FILTER(WHERE direction='inbound')::int AS inbound_count,
   count(*) FILTER(WHERE direction='outbound')::int AS outbound_count
  FROM recent_messages GROUP BY 1
 ),
 calendar AS(
  SELECT generate_series((now() AT TIME ZONE 'UTC')::date-(v_days-1),
    (now() AT TIME ZONE 'UTC')::date,'1 day'::interval)::date AS day
 )
 SELECT jsonb_build_object(
  'ok',true,'scope',CASE WHEN v_role IN ('admin','manager') THEN 'workspace' ELSE 'assigned' END,
  'days',v_days,'generated_at',now(),
  'conversations',(SELECT count(*)::int FROM visible_conversations),
  'contacts',(SELECT count(DISTINCT contact_id)::int FROM visible_conversations),
  'messages',(SELECT count(*)::int FROM recent_messages),
  'inbound',(SELECT count(*)::int FROM recent_messages WHERE direction='inbound'),
  'outbound',(SELECT count(*)::int FROM recent_messages WHERE direction='outbound'),
  'sent',(SELECT count(*)::int FROM recent_messages WHERE direction='outbound' AND provider_status='sent'),
  'delivered',(SELECT count(*)::int FROM recent_messages WHERE direction='outbound' AND provider_status='delivered'),
  'read',(SELECT count(*)::int FROM recent_messages WHERE direction='outbound' AND provider_status='read'),
  'failed',(SELECT count(*)::int FROM recent_messages WHERE direction='outbound' AND provider_status='failed'),
  'daily',(SELECT jsonb_agg(jsonb_build_object('day',to_char(cal.day,'YYYY-MM-DD'),
    'messages',coalesce(d.all_count,0),'inbound',coalesce(d.inbound_count,0),
    'outbound',coalesce(d.outbound_count,0)) ORDER BY cal.day)
   FROM calendar cal LEFT JOIN daily d ON d.day=cal.day)
 ) INTO v_result;
 RETURN v_result;
END $function$

REVOKE ALL ON FUNCTION public.fsp_analytics_summary(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_analytics_summary(uuid,integer) TO service_role;
COMMENT ON FUNCTION public.fsp_analytics_summary(uuid,integer) IS 'Service-role-only authorized aggregate message analytics; no personal data, no writes.';
