-- Stage B2: Durable audit/duplicate-suppression for explicit operator replies.
-- This schema does not enable any sending. It is never directly accessible to browser clients.
CREATE TABLE public.fsp_outbound_requests (
    request_id uuid PRIMARY KEY,
    operator_id uuid NOT NULL REFERENCES auth.users(id),
    conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id),
    state text NOT NULL DEFAULT 'claimed' CHECK (state IN ('claimed','accepted','rejected','unknown','persist_failed')),
    provider_message_id text,
    error_category text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fsp_outbound_requests_conv_idx ON public.fsp_outbound_requests (conversation_id, created_at DESC);
ALTER TABLE public.fsp_outbound_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fsp_outbound_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fsp_outbound_requests TO service_role;
CREATE POLICY deny_browser_access ON public.fsp_outbound_requests FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
COMMENT ON TABLE public.fsp_outbound_requests IS 'Operator-initiated limited test replies. One request id may never trigger a second Meta send. No client access.';