-- Stage 3: atomic and durable operator/recipient reply throttling.
-- This migration does not enable sending to real customers.
CREATE TABLE public.fsp_reply_rate_events (
 request_id uuid PRIMARY KEY REFERENCES public.fsp_outbound_requests(request_id),
 operator_id uuid NOT NULL REFERENCES public.fsp_operators(user_id),
 conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX fsp_reply_rate_operator_time_idx ON public.fsp_reply_rate_events(operator_id,created_at DESC);
CREATE INDEX fsp_reply_rate_conversation_time_idx ON public.fsp_reply_rate_events(conversation_id,created_at DESC);
ALTER TABLE public.fsp_reply_rate_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fsp_reply_rate_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.fsp_reply_rate_events TO service_role;
CREATE POLICY deny_client_access ON public.fsp_reply_rate_events
 FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
COMMENT ON TABLE public.fsp_reply_rate_events IS 'Server-only atomic manual reply rate reservations; no phone number, message content, or access token.';

CREATE FUNCTION public.fsp_reserve_reply_slot(
 p_request_id uuid,p_operator_id uuid,p_conversation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp
AS $$
DECLARE
 v_now timestamptz:=clock_timestamp();
 v_op_minute integer;v_op_hour integer;v_conversation_ten integer;
 v_last_conversation timestamptz;
BEGIN
 IF p_request_id IS NULL OR p_operator_id IS NULL OR p_conversation_id IS NULL THEN
  RETURN jsonb_build_object('allowed',false,'reason','invalid_request');
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.fsp_outbound_requests r
  JOIN public.fsp_operators o ON o.user_id=r.operator_id
  JOIN public.whatsapp_conversations c ON c.id=r.conversation_id
  WHERE r.request_id=p_request_id AND r.operator_id=p_operator_id
   AND r.conversation_id=p_conversation_id AND r.state='claimed'
   AND o.active=true AND o.role IN ('admin','manager','agent')
   AND (o.role<>'agent' OR c.assigned_to=p_operator_id)
 ) THEN
  RETURN jsonb_build_object('allowed',false,'reason','not_authorized');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fsp-op:'||p_operator_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('fsp-conv:'||p_conversation_id::text,0));
 IF EXISTS(SELECT 1 FROM public.fsp_reply_rate_events WHERE request_id=p_request_id) THEN
  RETURN jsonb_build_object('allowed',false,'reason','duplicate_request');
 END IF;
 SELECT count(*) FILTER(WHERE created_at>v_now-interval '60 seconds'),
  count(*) FILTER(WHERE created_at>v_now-interval '1 hour')
 INTO v_op_minute,v_op_hour FROM public.fsp_reply_rate_events
 WHERE operator_id=p_operator_id AND created_at>v_now-interval '1 hour';
 SELECT count(*),max(created_at) INTO v_conversation_ten,v_last_conversation
 FROM public.fsp_reply_rate_events WHERE conversation_id=p_conversation_id
 AND created_at>v_now-interval '10 minutes';
 IF v_op_minute>=5 THEN
  RETURN jsonb_build_object('allowed',false,'reason','operator_minute','retry_after_seconds',60);
 ELSIF v_op_hour>=30 THEN
  RETURN jsonb_build_object('allowed',false,'reason','operator_hour','retry_after_seconds',3600);
 ELSIF v_conversation_ten>=12 THEN
  RETURN jsonb_build_object('allowed',false,'reason','conversation_ten_minutes','retry_after_seconds',600);
 ELSIF v_last_conversation IS NOT NULL AND v_last_conversation>v_now-interval '2 seconds' THEN
  RETURN jsonb_build_object('allowed',false,'reason','conversation_cooldown','retry_after_seconds',3);
 END IF;
 INSERT INTO public.fsp_reply_rate_events(request_id,operator_id,conversation_id,created_at)
 VALUES(p_request_id,p_operator_id,p_conversation_id,v_now);
 RETURN jsonb_build_object('allowed',true,'reason','reserved');
END;
$$;
REVOKE ALL ON FUNCTION public.fsp_reserve_reply_slot(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_reserve_reply_slot(uuid,uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.fsp_reserve_reply_slot(uuid,uuid,uuid)
 IS 'Internal service-role manual reply admission gate. Does not send messages; requires prior idempotent request claim.';
