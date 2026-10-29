-- FSP Connect Stage B: durable message processor; no network calls or outgoing sends.
-- Must run in the standalone fsp-whatsapp-ai project.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

CREATE FUNCTION public.fsp_stage_b_drain_queue(p_batch_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE ev record; result text; claimed int:=0; completed int:=0; retried int:=0; dead int:=0;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 100 THEN RAISE EXCEPTION 'Invalid worker batch size'; END IF;
  FOR ev IN SELECT id,lease_token FROM public.fsp_claim_events(p_batch_size,60) LOOP
    claimed:=claimed+1;
    result:=public.fsp_process_event(ev.id,ev.lease_token,5);
    CASE result
      WHEN 'completed' THEN completed:=completed+1;
      WHEN 'retry' THEN retried:=retried+1;
      WHEN 'dead' THEN dead:=dead+1;
      ELSE NULL;
    END CASE;
  END LOOP;
  RETURN jsonb_build_object('claimed',claimed,'completed',completed,'retried',retried,'dead',dead);
END;
$$;
REVOKE ALL ON FUNCTION public.fsp_stage_b_drain_queue(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_stage_b_drain_queue(integer) TO service_role;

SELECT cron.schedule('fsp_connect_stage_b_inbound_worker','* * * * *',
  $$SELECT public.fsp_stage_b_drain_queue(25);$$);