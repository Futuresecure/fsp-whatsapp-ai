-- FSP Connect 2.1 Stage 4: private operational alerts and heartbeat.
-- This code NEVER calls Meta and NEVER sends external notifications.
CREATE TABLE public.fsp_operational_alerts (
 alert_key text PRIMARY KEY,
 category text NOT NULL CHECK (category IN ('reply_uncertain','reply_claim_stalled','provider_failed','outbound_status_pending','webhook_dead','webhook_stalled')),
 severity text NOT NULL CHECK (severity IN ('warning','critical')),
 source_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 occurrences integer NOT NULL DEFAULT 1 CHECK(occurrences>=1)
);
CREATE INDEX fsp_operational_alerts_status_idx ON public.fsp_operational_alerts(status,severity,last_seen_at DESC);
ALTER TABLE public.fsp_operational_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fsp_operational_alerts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fsp_operational_alerts TO service_role;
COMMENT ON TABLE public.fsp_operational_alerts IS 'Private internal ops alerts only; no phone numbers, message contents, tokens or notifications.';

CREATE TABLE public.fsp_monitor_heartbeat(
 monitor_key text PRIMARY KEY,
 last_run_at timestamptz NOT NULL,
 open_alerts integer NOT NULL CHECK(open_alerts>=0)
);
ALTER TABLE public.fsp_monitor_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fsp_monitor_heartbeat FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fsp_monitor_heartbeat TO service_role;
COMMENT ON TABLE public.fsp_monitor_heartbeat IS 'Last successful internal alert scan for monitoring freshness.';

CREATE FUNCTION public.fsp_scan_operational_alerts()
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp
AS $body$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_active text[]:=ARRAY[]::text[];
 v_open int:=0;
 v_changed int:=0;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('fsp-connect-stage4-monitor',0)) THEN
   RETURN jsonb_build_object('scanned',false,'reason','already_running');
 END IF;
 WITH detected AS (
  SELECT 'reply_uncertain'::text AS category,'critical'::text AS severity,r.request_id AS source_id
  FROM public.fsp_outbound_requests r WHERE r.state IN ('unknown','persist_failed')
  UNION ALL
  SELECT 'reply_claim_stalled','warning',r.request_id
  FROM public.fsp_outbound_requests r WHERE r.state='claimed' AND r.created_at<v_now-interval '10 minutes'
  UNION ALL
  SELECT 'provider_failed','critical',m.id
  FROM public.whatsapp_messages m WHERE m.direction='outbound' AND m.provider_status='failed'
  UNION ALL
  SELECT 'outbound_status_pending','warning',m.id
  FROM public.whatsapp_messages m WHERE m.direction='outbound' AND m.provider_status='pending'
    AND m.created_at<v_now-interval '30 minutes'
  UNION ALL
  SELECT 'webhook_dead','critical',e.id
  FROM public.fsp_webhook_events e WHERE e.state='dead'
  UNION ALL
  SELECT 'webhook_stalled','warning',e.id
  FROM public.fsp_webhook_events e WHERE
    (e.state='queued' AND e.received_at<v_now-interval '15 minutes')
    OR (e.state='processing' AND e.lease_until<v_now-interval '5 minutes')
 ), saved AS (
  INSERT INTO public.fsp_operational_alerts
   (alert_key,category,severity,source_id,status,first_seen_at,last_seen_at,occurrences)
  SELECT category||':'||source_id::text,category,severity,source_id,'open',v_now,v_now,1
  FROM detected
  ON CONFLICT(alert_key) DO UPDATE SET
    severity=EXCLUDED.severity,
    status='open',
    last_seen_at=EXCLUDED.last_seen_at,
    resolved_at=NULL,
    occurrences=fsp_operational_alerts.occurrences+1,
    first_seen_at=CASE WHEN fsp_operational_alerts.status='resolved'
      THEN EXCLUDED.first_seen_at ELSE fsp_operational_alerts.first_seen_at END
  RETURNING alert_key
 )
 SELECT coalesce(array_agg(alert_key),ARRAY[]::text[]) INTO v_active FROM saved;
 UPDATE public.fsp_operational_alerts
 SET status='resolved',resolved_at=v_now,last_seen_at=v_now
 WHERE status='open' AND NOT (alert_key=ANY(v_active));
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 SELECT count(*) INTO v_open FROM public.fsp_operational_alerts WHERE status='open';
 INSERT INTO public.fsp_monitor_heartbeat(monitor_key,last_run_at,open_alerts)
 VALUES('stage4_reply_and_webhook',v_now,v_open)
 ON CONFLICT(monitor_key) DO UPDATE SET
  last_run_at=EXCLUDED.last_run_at,open_alerts=EXCLUDED.open_alerts;
 RETURN jsonb_build_object('scanned',true,'open_alerts',v_open,
   'auto_resolved',v_changed,'checked_at',v_now);
END;
$body$;
REVOKE ALL ON FUNCTION public.fsp_scan_operational_alerts() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_scan_operational_alerts() TO service_role;
COMMENT ON FUNCTION public.fsp_scan_operational_alerts() IS 'Private fail-safe internal scan only. No outbound notification, Meta call or customer mutation.';

SELECT cron.schedule(
 'fsp_connect_stage4_monitor',
 '*/5 * * * *',
 'SELECT public.fsp_scan_operational_alerts();'
);
