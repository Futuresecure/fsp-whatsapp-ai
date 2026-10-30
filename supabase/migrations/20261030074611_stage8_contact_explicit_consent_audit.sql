-- FSP Connect Stage 8: atomic contact consent and operator evidence (no Meta sends).
CREATE TABLE public.fsp_contact_consent_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 contact_id uuid NOT NULL REFERENCES public.whatsapp_contacts(id),
 operator_id uuid NOT NULL REFERENCES public.fsp_operators(user_id),
 event_type text NOT NULL CHECK(event_type IN ('opt_in','opt_out')),
 source text NOT NULL CHECK(source IN ('whatsapp_inbound_request','signed_paper','web_form','direct_request','customer_request')),
 proof_ref text,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX fsp_consent_contact_idx ON public.fsp_contact_consent_events(contact_id,recorded_at DESC);
ALTER TABLE public.fsp_contact_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fsp_contact_consent_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.fsp_contact_consent_events TO service_role;
CREATE POLICY deny_client_access ON public.fsp_contact_consent_events FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
COMMENT ON TABLE public.fsp_contact_consent_events IS 'Private explicit consent evidence events; no marketing sends.';

CREATE FUNCTION public.fsp_record_contact_consent(
 p_contact_id uuid,p_operator_id uuid,p_event_type text,p_source text,p_proof_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
DECLARE v_updated uuid;
BEGIN
 IF p_contact_id IS NULL OR p_operator_id IS NULL OR p_event_type NOT IN ('opt_in','opt_out') THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fsp_operators WHERE user_id=p_operator_id AND active=true AND role IN ('admin','manager')) THEN
  RETURN jsonb_build_object('ok',false,'reason','not_authorized');
 END IF;
 IF p_event_type='opt_in' AND (
   p_source NOT IN ('whatsapp_inbound_request','signed_paper','web_form','direct_request')
   OR p_proof_ref IS NULL OR length(btrim(p_proof_ref)) NOT BETWEEN 6 AND 160
 ) THEN RETURN jsonb_build_object('ok',false,'reason','evidence_required');END IF;
 IF p_event_type='opt_out' AND p_source<>'customer_request' THEN
  RETURN jsonb_build_object('ok',false,'reason','invalid_opt_out_source');
 END IF;
 SELECT id INTO v_updated FROM public.whatsapp_contacts WHERE id=p_contact_id FOR UPDATE;
 IF v_updated IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','contact_not_found');END IF;
 UPDATE public.whatsapp_contacts SET
  opted_in=(p_event_type='opt_in'),
  opted_in_at=CASE WHEN p_event_type='opt_in' THEN clock_timestamp() ELSE NULL END,
  opted_out_at=CASE WHEN p_event_type='opt_out' THEN clock_timestamp() ELSE NULL END,
  updated_at=clock_timestamp() WHERE id=p_contact_id;
 INSERT INTO public.fsp_contact_consent_events(contact_id,operator_id,event_type,source,proof_ref)
 VALUES(p_contact_id,p_operator_id,p_event_type,p_source,
  CASE WHEN p_event_type='opt_in' THEN btrim(p_proof_ref) ELSE NULL END);
 RETURN jsonb_build_object('ok',true,'event_type',p_event_type,'opted_in',p_event_type='opt_in');
END $function$;
REVOKE ALL ON FUNCTION public.fsp_record_contact_consent(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fsp_record_contact_consent(uuid,uuid,text,text,text) TO service_role;
COMMENT ON FUNCTION public.fsp_record_contact_consent(uuid,uuid,text,text,text) IS 'Atomic opt-in/out recorded only by active manager/admin via service role. No outbound messaging.';
