-- Stage 6 explicit deny-all browser policies, preserving service-role-only access.
-- Applied migration 20261030063553 on standalone FSP Connect Supabase project.
CREATE POLICY deny_client_access ON public.fsp_operational_alerts
 FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
CREATE POLICY deny_client_access ON public.fsp_monitor_heartbeat
 FOR ALL TO anon,authenticated USING(false) WITH CHECK(false);
