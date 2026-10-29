-- FSP Connect 2.1 Stage A3/A4; additive only. Existing CRM is untouched.
create table public.fsp_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','manager','agent','viewer')),
  active boolean not null default false,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.fsp_operators is 'Administrator-provisioned FSP Connect operators only; no public enrollment';

create table public.fsp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 8 and 250),
  event_type text not null check(event_type in ('message','status')),
  waba_id text,
  phone_number_id text,
  provider_message_id text not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  state text not null default 'queued' check (state in ('queued','processing','completed','dead')),
  attempts integer not null default 0 check(attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index fsp_webhook_events_ready_idx on public.fsp_webhook_events (next_attempt_at,received_at) where state in ('queued','processing');
create index fsp_webhook_events_provider_idx on public.fsp_webhook_events(provider_message_id);

create table public.fsp_message_status_events (
  event_key text primary key references public.fsp_webhook_events(event_key) on delete restrict,
  provider_message_id text not null,
  provider_status text not null check (provider_status in ('sent','delivered','read','failed')),
  provider_timestamp timestamptz,
  error_code text,
  created_at timestamptz not null default now()
);
create index fsp_message_status_events_message_idx on public.fsp_message_status_events(provider_message_id,provider_timestamp desc);

create table public.fsp_operator_audit (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id),
  conversation_id uuid references public.whatsapp_conversations(id),
  action text not null check(length(action) between 3 and 80),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index fsp_operator_audit_operator_idx on public.fsp_operator_audit(operator_id,created_at desc);

-- Never allow direct browser access; server-side Supabase Auth user verification + RBAC mandatory.
do $$ declare t text; begin
  foreach t in array array['fsp_operators','fsp_webhook_events','fsp_message_status_events','fsp_operator_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on table public.%I to service_role',t);
    execute format('create policy deny_client_access on public.%I for all to anon,authenticated using (false) with check(false)',t);
  end loop;
end; $$;

-- NOTE: only service_role may execute these transaction-safe routines; all use SECURITY INVOKER.
create function public.fsp_enqueue_events(p_events jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare e jsonb; inserted integer := 0; affected integer;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 1000 then
    raise exception 'invalid event batch';
  end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'event_type','') not in ('message','status') or
       length(coalesce(e->>'event_key','')) < 8 or length(coalesce(e->>'event_key','')) > 250 or
       length(coalesce(e->>'provider_message_id','')) < 3 or
       jsonb_typeof(e->'payload') <> 'object' then
      raise exception 'invalid event';
    end if;
    insert into public.fsp_webhook_events(event_key,event_type,waba_id,phone_number_id,provider_message_id,payload)
    values(e->>'event_key',e->>'event_type',left(e->>'waba_id',128),left(e->>'phone_number_id',128),e->>'provider_message_id',e->'payload')
    on conflict(event_key) do nothing;
    get diagnostics affected = row_count;
    inserted := inserted + affected;
  end loop;
  return inserted;
end; $$;

create function public.fsp_claim_events(p_limit integer default 10, p_lease_seconds integer default 60)
returns setof public.fsp_webhook_events language plpgsql security invoker set search_path = '' as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 15 and 600 then
    raise exception 'invalid lease parameters';
  end if;
  return query
  with claimed as (
    select id from public.fsp_webhook_events
    where ((state = 'queued' and next_attempt_at <= now()) or
           (state = 'processing' and lease_until < now()))
    order by received_at,id limit p_limit for update skip locked
  )
  update public.fsp_webhook_events e set state='processing', lease_token=gen_random_uuid(),
    lease_until=now()+make_interval(secs=>p_lease_seconds), attempts=e.attempts+1
  from claimed where e.id=claimed.id returning e.*;
end; $$;

-- Preserve highest provider-observed delivery state, even when events arrive out of order.
create function public.fsp_reconcile_message_status(p_message_id text)
returns void language plpgsql security invoker set search_path = '' as $$
declare s record;
begin
  select provider_status, provider_timestamp,error_code into s
  from public.fsp_message_status_events where provider_message_id=p_message_id
  order by case provider_status when 'read' then 4 when 'delivered' then 3 when 'sent' then 2 else 1 end desc,
           provider_timestamp desc nulls last limit 1;
  if not found then return; end if;
  update public.whatsapp_messages set
    provider_status=case when provider_status='read' then 'read'
      when provider_status='delivered' and s.provider_status in ('sent','failed') then 'delivered'
      when provider_status='sent' and s.provider_status='failed' then 'sent'
      else s.provider_status end,
    sent_at=case when s.provider_status in ('sent','delivered','read') then coalesce(sent_at,s.provider_timestamp,now()) else sent_at end,
    delivered_at=case when s.provider_status in ('delivered','read') then coalesce(delivered_at,s.provider_timestamp,now()) else delivered_at end,
    read_at=case when s.provider_status='read' then coalesce(read_at,s.provider_timestamp,now()) else read_at end,
    error_code=case when s.provider_status='failed' then s.error_code else error_code end
  where provider_message_id=p_message_id and direction='outbound';
end; $$;

-- For outbound messages persisted at a later stage, previously received status events can be reconciled.
create function public.fsp_reconcile_outbound_insert()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if new.direction='outbound' and new.provider_message_id is not null then
   perform public.fsp_reconcile_message_status(new.provider_message_id);
 end if;
 return new;
end; $$;
create trigger fsp_status_after_outbound_insert after insert on public.whatsapp_messages
for each row execute function public.fsp_reconcile_outbound_insert();

create function public.fsp_process_event(p_id uuid, p_lease uuid, p_max_attempts integer default 5)
returns text language plpgsql security invoker set search_path = '' as $$
declare ev public.fsp_webhook_events%rowtype; p jsonb; v_contact uuid; v_conversation uuid;
        v_msg uuid; v_wa text; v_when timestamptz; v_type text; v_err text;
begin
  if p_max_attempts not between 1 and 20 then raise exception 'invalid max attempts'; end if;
  select * into ev from public.fsp_webhook_events where id=p_id for update;
  if not found or ev.state <> 'processing' or ev.lease_token is distinct from p_lease or ev.lease_until < now() then
    return 'not_owned';
  end if;
  begin
    p:=ev.payload;
    if ev.event_type='message' then
      v_wa:=p->>'wa_id';
      if v_wa is null or v_wa !~ '^[0-9]{6,20}$' then raise exception 'invalid wa_id'; end if;
      v_type:=p->>'message_type';
      if v_type not in ('text','image','document','audio','video','interactive','template','location','contacts','reaction','other') then
         v_type:='other';
      end if;
      v_when:=case when (p->>'timestamp') ~ '^[0-9]{9,12}$'
                   then to_timestamp((p->>'timestamp')::numeric) else ev.received_at end;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_wa,0));
      insert into public.whatsapp_contacts(wa_id,profile_name,last_message_at)
        values(v_wa,left(p->>'profile_name',250),v_when)
        on conflict (wa_id) do update set
          profile_name=coalesce(public.whatsapp_contacts.profile_name,excluded.profile_name)
        returning id into v_contact;
      select id into v_conversation from public.whatsapp_conversations where contact_id=v_contact
        order by created_at desc,id desc limit 1 for update;
      if v_conversation is null then
        insert into public.whatsapp_conversations(contact_id) values(v_contact) returning id into v_conversation;
      end if;
      insert into public.whatsapp_messages(conversation_id,provider_message_id,direction,sender_type,
        message_type,body,media_ref,provider_status,provider_timestamp,metadata)
      values(v_conversation,ev.provider_message_id,'inbound','customer',v_type,
        case when v_type='text' then left(p->>'body',16000) when v_type not in ('image','document','audio','video') then '['||v_type||']' else null end,
        case when v_type in ('image','document','audio','video') then left(p->>'media_id',256) else null end,
        'received',v_when,jsonb_build_object('provider','meta'))
      on conflict(provider_message_id) do nothing returning id into v_msg;
      -- Non-text structured messages require no invented media URL; their body holds a short type label.
      if v_msg is not null then
        update public.whatsapp_conversations set status='open',closed_at=null,
           last_message_at=greatest(coalesce(last_message_at,v_when),v_when),
           unread_count=unread_count+1,updated_at=now() where id=v_conversation;
        update public.whatsapp_contacts set last_message_at=greatest(coalesce(last_message_at,v_when),v_when),
           updated_at=now() where id=v_contact;
      end if;
    elsif ev.event_type='status' then
      if coalesce(p->>'status','') not in ('sent','delivered','read','failed') then
        raise exception 'invalid status';
      end if;
      v_when:=case when (p->>'timestamp') ~ '^[0-9]{9,12}$'
                   then to_timestamp((p->>'timestamp')::numeric) else ev.received_at end;
      insert into public.fsp_message_status_events(event_key,provider_message_id,provider_status,provider_timestamp,error_code)
        values(ev.event_key,ev.provider_message_id,p->>'status',v_when,left(p->>'error_code',100))
        on conflict(event_key) do nothing;
      perform public.fsp_reconcile_message_status(ev.provider_message_id);
    end if;
    update public.fsp_webhook_events set state='completed',processed_at=now(),lease_token=null,lease_until=null,
       last_error=null where id=p_id;
    return 'completed';
  exception when others then
    get stacked diagnostics v_err = message_text;
    update public.fsp_webhook_events set
      state=case when attempts >= p_max_attempts then 'dead' else 'queued' end,
      next_attempt_at=now()+make_interval(secs=>least(3600,(2 ^ least(attempts,10))::integer)),
      last_error=left(v_err,500),lease_token=null,lease_until=null
    where id=p_id;
    return case when ev.attempts >= p_max_attempts then 'dead' else 'retry' end;
  end;
end; $$;

-- Direct client API access to functions is denied. Service_role can invoke, no SECURITY DEFINER used.
do $$ declare f text; begin
 foreach f in array array['fsp_enqueue_events(jsonb)','fsp_claim_events(integer,integer)',
  'fsp_reconcile_message_status(text)','fsp_process_event(uuid,uuid,integer)','fsp_reconcile_outbound_insert()'] loop
   execute format('revoke all on function public.%s from public,anon,authenticated',f);
   execute format('grant execute on function public.%s to service_role',f);
 end loop;
end; $$;