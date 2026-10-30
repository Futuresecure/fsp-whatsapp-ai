import {buildAutoReadFilter} from './auto-read.mjs';
import {buildConversationSearchWhere} from './conversation-query.mjs';
import {inspectReplyRollout} from './reply-readiness.mjs';
import {summarizeOperationalAlerts} from './operations-core.mjs';
import {checkMetaConnection} from './meta-connection.mjs';
import {assessReply,sendGraphText,executeRestrictedReply} from './reply-core.mjs';
import {resolveFspRoute} from './route.mjs';
/**
 * FSP Connect 2.1 — staging-only operator API.
 * No Meta API calls, customer imports, templates, broadcasts, or automated sends.
 * The function uses project-managed secrets; none are exposed to the browser.
 * verify_jwt=false at the gateway to permit CORS preflight; EVERY /api route
 * independently verifies a fresh Supabase Auth JWT AND active operator row.
 */
const PROJECT_URL = Deno.env.get('SUPABASE_URL') ?? '';
const secretKeys = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); } catch { return {}; } })();
const ADMIN_KEY = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLISHABLE = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default; } catch { return ''; } })() || Deno.env.get('SUPABASE_ANON_KEY') || '';
const CORS: Record<string,string> = {
  'access-control-allow-origin':'https://futuresecureproviders.com',
  'vary':'Origin',
  'access-control-allow-methods':'GET, POST, OPTIONS',
  'access-control-allow-headers':'authorization, apikey, content-type, x-client-info',
  'access-control-max-age':'600',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
};
const isUUID = (s:unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const escapeQuery = (v:string) => encodeURIComponent(v);
const n = (v:string|null,max=100) => Math.min(max,Math.max(1,Number(v)||25));
function respond(status:number, object:unknown): Response {return new Response(JSON.stringify(object),{status,headers:{...CORS,'content-type':'application/json; charset=utf-8'}})}
function fail(status:number,message:string){return respond(status,{error:message})}
function configured(){return Boolean(PROJECT_URL && ADMIN_KEY && (PUBLISHABLE||ADMIN_KEY));}
async function callSupabase<T=unknown>(route:string, opts:{method?:string, body?:unknown, prefer?:string, jwt?:string}={}) :Promise<{data:T, count:number|null}> {
  const headers:Record<string,string>={'apikey':ADMIN_KEY,'accept':'application/json'};
  // New sb_secret keys are API keys, NOT bearer JWTs.
  if(!ADMIN_KEY.startsWith('sb_secret_'))headers.authorization='Bearer '+ADMIN_KEY;
  if(opts.jwt)headers.authorization='Bearer '+opts.jwt;
  if(opts.prefer)headers.prefer=opts.prefer;
  if(opts.body!==undefined)headers['content-type']='application/json';
  const res=await fetch(PROJECT_URL+route,{method:opts.method||'GET',headers,body:opts.body!==undefined?JSON.stringify(opts.body):undefined,signal:AbortSignal.timeout(10000)});
  if(!res.ok){throw new Error('Data access failed ('+res.status+')')}
  const ct=res.headers.get('content-type')??'';
  const json=(ct.includes('json')?await res.json():null) as T;
  const range=res.headers.get('content-range')??'';
  const match=/\/(\d+)$/.exec(range);
  return {data:json,count:match?Number(match[1]):null};
}
const rest=(table:string,q:string, opts:{method?:string,body?:unknown,prefer?:string}={})=>callSupabase<unknown[]>('/rest/v1/'+table+q,opts);
async function getAuthOperator(req:Request){
  const token=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')??'')?.[1];
  if(!token || token.length>8192)return {status:401,error:'Authentication required'};
  const result=await fetch(PROJECT_URL+'/auth/v1/user',{
    headers:{'apikey':PUBLISHABLE||ADMIN_KEY,'authorization':'Bearer '+token},
    signal:AbortSignal.timeout(10000)
  });
  if(!result.ok)return {status:401,error:'Session invalid or expired'};
  const user=await result.json();
  if(!isUUID(user.id) || user.is_anonymous===true)return {status:401,error:'Authentication required'};
  const {data}=await rest('fsp_operators','?select=user_id,role,active,display_name&user_id=eq.'+escapeQuery(user.id)+'&limit=1');
  const op=(data as any[])?.[0];
  if(!op?.active || !['admin','manager','agent','viewer'].includes(op.role))return {status:403,error:'Operator access not activated'};
  return {user,op};
}
function allowAll(op:any){return op.role==='admin'||op.role==='manager'}
async function conversationById(op:any,id:string){
  const {data}=await rest('whatsapp_conversations','?select=id,contact_id,assigned_to,status,ai_enabled,unread_count,last_message_at,created_at,closed_at&id=eq.'+escapeQuery(id)+'&limit=1');
  const c=(data as any[])?.[0];
  return c && (allowAll(op)||c.assigned_to===op.user_id)?c:null;
}
async function getCount(table:string,filter=''){
  const res=await callSupabase<unknown[]>('/rest/v1/'+table+'?select=id'+filter+'&limit=1',{prefer:'count=exact'});
  return res.count??(res.data?.length??0);
}
async function getApi(req:Request,path:string,op:any,url:URL):Promise<Response>{
  const limit=n(url.searchParams.get('limit'),100);
  const offset=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0));
  const scope=allowAll(op)?'':'&assigned_to=eq.'+escapeQuery(op.user_id);
  const pagination='&limit='+limit+'&offset='+offset;
  if(path==='/api/me')return respond(200,{id:op.user_id,role:op.role,name:op.display_name||'Operator'});
  if(path==='/api/meta/connection-check'){
    if(op.role!=='admin')return fail(403,'Administrator access required');
    const config={
      phoneNumberId:Deno.env.get('FSP_META_PHONE_NUMBER_ID')??'',
      accessToken:Deno.env.get('FSP_META_ACCESS_TOKEN')??'',
      testRecipient:Deno.env.get('FSP_META_TEST_RECIPIENT')??'',
      sendingEnabled:Deno.env.get('FSP_META_SENDING_ENABLED')==='true'
    };
    const result=await checkMetaConnection({config});
    return respond(200,result);
  }
  if(path==='/api/reply-readiness'){
    if(op.role!=='admin')return fail(403,'Administrator access required');
    return respond(200,inspectReplyRollout({
      accessToken:Deno.env.get('FSP_META_ACCESS_TOKEN')??'',
      phoneNumberId:Deno.env.get('FSP_META_PHONE_NUMBER_ID')??'',
      testRecipient:Deno.env.get('FSP_META_TEST_RECIPIENT')??'',
      testSendingEnabled:Deno.env.get('FSP_META_SENDING_ENABLED')==='true'
    }));
  }
  if(path==='/api/operational-alerts'){
    if(op.role!=='admin')return fail(403,'Administrator access required');
    // Read-only internal notifications: neither messages nor phone numbers returned.
    // Staleness is surfaced explicitly; a stopped monitor must not look healthy.
    const [open,critical,heart]=await Promise.all([
      rest('fsp_operational_alerts',
        '?select=category,severity,first_seen_at,last_seen_at,occurrences&status=eq.open&order=last_seen_at.desc&limit=25',
        {prefer:'count=exact'}),
      rest('fsp_operational_alerts',
        '?select=alert_key&status=eq.open&severity=eq.critical&limit=1',
        {prefer:'count=exact'}),
      rest('fsp_monitor_heartbeat',
        '?select=last_run_at,open_alerts&monitor_key=eq.stage4_reply_and_webhook&limit=1')
    ]);
    return respond(200,summarizeOperationalAlerts({
      rows:open.data,
      openCount:open.count,
      criticalCount:critical.count,
      heartbeat:(heart.data as any[])?.[0]||null
    }));
  }
  if(path==='/api/reply-operations'){
    if(op.role!=='admin')return fail(403,'Administrator access required');
    // Counts only; never return phone numbers, message text, or access tokens.
    const since=escapeQuery(new Date(Date.now()-24*60*60*1000).toISOString());
    const base='?select=request_id&created_at=gte.'+since;
    const summary=async(filter:string)=>{
      const result=await rest('fsp_outbound_requests',base+filter+'&limit=1',{prefer:'count=exact'});
      return result.count??(result.data as any[])?.length??0;
    };
    const [attempts,accepted,unknown,persistFailed,rateLimited,providerFailed]=await Promise.all([
      summary(''),summary('&state=eq.accepted'),summary('&state=eq.unknown'),
      summary('&state=eq.persist_failed'),summary('&error_category=eq.rate_limited'),
      getCount('whatsapp_messages','&direction=eq.outbound&provider_status=eq.failed&created_at=gte.'+since)
    ]);
    return respond(200,{environment:'staging',mode:'test_recipient_only',
      window_hours:24,attempts,accepted,unknown,persist_failed:persistFailed,
      provider_failed:providerFailed,rate_limited:rateLimited,
      needs_review:unknown+persistFailed+providerFailed,
      database_rate_gate:true,production_customer_sending:false});
  }
  if(path==='/api/health')return respond(200,{authenticated:true,connected:true,sending:false,aiAutoReply:false,broadcast:false});
  if(path==='/api/dashboard'){
    const [conversations,unread,contacts,messages]=await Promise.all([
      getCount('whatsapp_conversations',scope),
      getCount('whatsapp_conversations',scope+'&unread_count=gt.0'),
      allowAll(op)?getCount('whatsapp_contacts'):Promise.resolve(null),
      allowAll(op)?getCount('whatsapp_messages'):Promise.resolve(null),
    ]);
    return respond(200,{conversations,unread_conversations:unread,contacts,messages,scope:allowAll(op)?'workspace':'assigned',live_sending:false});
  }
  if(path==='/api/conversations'){
    const parsed=buildConversationSearchWhere({
      query:url.searchParams.get('q')??'',
      filter:url.searchParams.get('filter')??'all'
    });
    if(!parsed.ok)return fail(400,parsed.error||'Invalid search');
    const where=scope+parsed.where;
    // View is security_invoker and SELECT only for service_role. Enforce operator
    // assignment scope BEFORE pagination; no unauthorized contact enumeration.
    const {data,count}=await rest('fsp_conversation_search',
      '?select=id,contact_id,assigned_to,status,ai_enabled,unread_count,last_message_at,created_at,contact_name,contact_wa_id'+
      where+'&order=last_message_at.desc.nullslast'+pagination,{prefer:'count=exact'});
    const results=(data as any[])||[];
    return respond(200,{data:results,limit,offset,total:count,has_more:count===null?results.length===limit:offset+results.length<count});
  }
  if(path==='/api/contacts'){
    if(allowAll(op)){
      const {data}=await rest('whatsapp_contacts','?select=id,wa_id,display_name,profile_name,language_code,tags,last_message_at&order=last_message_at.desc.nullslast'+pagination);
      return respond(200,{data,limit,offset});
    }
    const {data:convs}=await rest('whatsapp_conversations','?select=contact_id'+scope+'&limit=1000');
    const ids=[...new Set((convs as any[]).map(c=>c.contact_id))].filter(isUUID);
    if(!ids.length)return respond(200,{data:[]});
    const {data}=await rest('whatsapp_contacts','?select=id,wa_id,display_name,profile_name,language_code,tags,last_message_at&id=in.('+ids.join(',')+')'+pagination);
    return respond(200,{data,limit,offset});
  }
  const match=/^\/api\/conversations\/([0-9a-f-]+)(?:\/(messages))?$/.exec(path);
  if(match){
    if(!isUUID(match[1]))return fail(400,'Invalid conversation ID');
    const conv=await conversationById(op,match[1]);
    if(!conv)return fail(404,'Conversation not found');
    if(match[2]==='messages'){
      const {data}=await rest('whatsapp_messages','?select=id,direction,sender_type,message_type,body,provider_status,provider_timestamp,created_at&conversation_id=eq.'+escapeQuery(match[1])+'&order=created_at.desc'+pagination);
      return respond(200,{data,limit,offset});
    }
    const {data:people}=await rest('whatsapp_contacts','?select=id,wa_id,display_name,profile_name,language_code,tags&id=eq.'+escapeQuery(conv.contact_id)+'&limit=1');
    return respond(200,{data:{...conv,contact:(people as any[])?.[0]||null}});
  }
  if(path==='/api/operators' && allowAll(op)){
    const {data}=await rest('fsp_operators','?select=user_id,display_name,role&active=eq.true&order=display_name.asc&limit=100');
    return respond(200,{data});
  }
  if(path==='/api/settings')return respond(200,{sending:false,bulk_broadcast:false,ai_auto_reply:false,automation:false,meta_connected:false,environment:'staging'});
  return fail(404,'Not found');
}

/** Stage B2: explicit manual reply; no sending until every independent staging gate is set. */
async function postRestrictedReply(req:Request,conversationId:string,op:any):Promise<Response>{
  if(!isUUID(conversationId))return fail(400,'Invalid conversation ID');
  if(op.role==='viewer')return fail(403,'Read-only operator');
  const enabled=Deno.env.get('FSP_META_SENDING_ENABLED')==='true';
  if(!enabled)return fail(503,'WhatsApp sending is disabled');
  const conf={
    enabled,
    phoneNumberId:Deno.env.get('FSP_META_PHONE_NUMBER_ID')??'',
    token:Deno.env.get('FSP_META_ACCESS_TOKEN')??'',
    allowRecipient:Deno.env.get('FSP_META_TEST_RECIPIENT')??''
  };
  const length=Number(req.headers.get('content-length')||0);
  if(length>8192)return fail(413,'Request too large');
  const raw=await req.text();
  if(raw.length>8192)return fail(413,'Request too large');
  let data:any;
  try{data=JSON.parse(raw)}catch{return fail(400,'Invalid JSON')}
  if(!data||typeof data!=='object'||Array.isArray(data))return fail(400,'Invalid body');
  const conversation=await conversationById(op,conversationId);
  if(!conversation)return fail(404,'Conversation not found');
  const {data:contacts}=await rest('whatsapp_contacts',
    '?select=wa_id&id=eq.'+escapeQuery(conversation.contact_id)+'&limit=1');
  const recipient=(contacts as any[])?.[0]?.wa_id;
  const {data:incoming}=await rest('whatsapp_messages',
    '?select=provider_timestamp&conversation_id=eq.'+escapeQuery(conversationId)+
    '&direction=eq.inbound&order=provider_timestamp.desc.nullslast&limit=1');
  const lastInboundAt=(incoming as any[])?.[0]?.provider_timestamp;
  const checked=assessReply({operator:op,conversation,recipient,lastInboundAt,
    text:data.text,requestId:data.request_id,config:conf});
  if(!checked.ok)return fail(checked.status,checked.error);
  const reqId=checked.requestId;
  const result=await executeRestrictedReply({
    input:checked,
    claim:async()=>{
      try{
        const r=await callSupabase<any[]>('/rest/v1/fsp_outbound_requests',{
          method:'POST',body:{request_id:reqId,operator_id:op.user_id,
            conversation_id:conversationId,state:'claimed'},prefer:'return=representation'});
        return Array.isArray(r.data)&&r.data.length===1;
      }catch(e){if(e instanceof Error && e.message.includes('(409)'))return false;throw e;}
    },
    admit:async()=>{
      // Transactional database gate; no admission means NO Meta API request.
      // The service role is the only database principal allowed to call the RPC.
      const result=await callSupabase<any>('/rest/v1/rpc/fsp_reserve_reply_slot',{
        method:'POST',
        body:{p_request_id:reqId,p_operator_id:op.user_id,p_conversation_id:conversationId}
      });
      if(!result.data || typeof result.data!=='object' ||
         typeof result.data.allowed!=='boolean')
        throw new Error('Invalid reply admission confirmation');
      return result.data;
    },
    send:async()=>await sendGraphText({phoneNumberId:conf.phoneNumberId,
      recipient:checked.recipient,text:checked.text,token:conf.token}),
    record:async(_input:any,messageId:string)=>{
      await callSupabase('/rest/v1/whatsapp_messages',{method:'POST',
        body:{conversation_id:conversationId,provider_message_id:messageId,
          direction:'outbound',sender_type:'agent',message_type:'text',
          body:checked.text,provider_status:'pending',
          metadata:{provider:'meta',request_id:reqId}},
        prefer:'return=minimal'});
      await callSupabase('/rest/v1/fsp_outbound_requests?request_id=eq.'+escapeQuery(reqId),{
        method:'PATCH',body:{state:'accepted',provider_message_id:messageId,
          updated_at:new Date().toISOString()},prefer:'return=minimal'});
      await callSupabase('/rest/v1/fsp_operator_audit',{method:'POST',
        body:{operator_id:op.user_id,conversation_id:conversationId,
          action:'send_text',details:{provider_message_id:messageId,request_id:reqId}},
        prefer:'return=minimal'});
    },
    markFailure:async(_requestId:string,reason:string)=>{
      const state=reason==='persist_failed'?'persist_failed':
        reason==='unknown'?'unknown':'rejected';
      await callSupabase('/rest/v1/fsp_outbound_requests?request_id=eq.'+escapeQuery(reqId),{
        method:'PATCH',body:{state,error_category:reason,updated_at:new Date().toISOString()},
        prefer:'return=minimal'});
    }
  });
  if(result.ok)return respond(200,{ok:true,message_id:result.messageId});
  if(result.warning)return respond(202,{warning:result.warning});
  if(result.status===429)return respond(429,{error:result.error,
    retry_after_seconds:result.retryAfterSeconds||60});
  return fail(result.status||503,result.error||'Unable to send');
}

async function postApi(req:Request,path:string,op:any):Promise<Response>{
  const replyMatch=/^\/api\/conversations\/([0-9a-f-]+)\/reply$/i.exec(path);
  if(replyMatch)return postRestrictedReply(req,replyMatch[1],op);
  const match=/^\/api\/conversations\/([0-9a-f-]+)\/actions$/.exec(path);
  if(!match)return fail(404,'Not found');
  const id=match[1];
  if(!isUUID(id))return fail(400,'Invalid conversation');
  if(op.role==='viewer')return fail(403,'Read-only operator');
  const conv=await conversationById(op,id);
  if(!conv)return fail(404,'Conversation not found');
  const length=Number(req.headers.get('content-length'));
  if(length>8192)return fail(413,'Body too large');
  const bodyText=await req.text();
  if(bodyText.length>8192)return fail(413,'Body too large');
  let body:any; try{body=JSON.parse(bodyText)}catch{return fail(400,'Invalid request JSON')}
  if(!body||typeof body!=='object'||Array.isArray(body))return fail(400,'Invalid request');
  const action=body.action;
  if(!['mark_read','auto_mark_read','resolve','reopen','takeover','pause_ai','assign','note'].includes(action))return fail(400,'Action not available in staging');
  if(action==='auto_mark_read'){
    // Never clear new inbound messages that arrived while the conversation was opening.
    // Only the specific unread count and last-message snapshot observed by the operator
    // may transition to zero. No Meta read receipt is sent by this internal action.
    const filter=buildAutoReadFilter({
      conversationId:id,
      observedLastMessageAt:body.observed_last_message_at,
      observedUnreadCount:body.observed_unread_count,
      assignedTo:allowAll(op)?null:op.user_id
    });
    if(!filter)return fail(400,'Invalid read snapshot');
    const changed=await callSupabase<any[]>('/rest/v1/whatsapp_conversations'+filter,{
      method:'PATCH',
      body:{unread_count:0,updated_at:new Date().toISOString()},
      prefer:'return=representation'
    });
    if(!Array.isArray(changed.data)||changed.data.length>1)return fail(503,'Unable to confirm unread update');
    if(changed.data.length===0)return respond(200,{ok:true,action,marked_read:false,reason:'snapshot_changed'});
    await callSupabase('/rest/v1/fsp_operator_audit',{
      method:'POST',
      body:{operator_id:op.user_id,conversation_id:id,action:'auto_mark_read',
        details:{previous_unread_count:body.observed_unread_count}},
      prefer:'return=minimal'
    });
    return respond(200,{ok:true,action,marked_read:true,unread_count:0});
  }
  const patch:Record<string,unknown>={updated_at:new Date().toISOString()};
  if(action==='mark_read')patch.unread_count=0;
  if(action==='resolve'){patch.status='resolved';patch.closed_at=new Date().toISOString()}
  if(action==='reopen'){patch.status='open';patch.closed_at=null}
  if(action==='takeover'){patch.ai_enabled=false;patch.assigned_to=op.user_id;patch.handoff_requested_at=new Date().toISOString()}
  if(action==='pause_ai')patch.ai_enabled=false;
  if(action==='assign'){
    if(!allowAll(op))return fail(403,'Insufficient permission');
    if(!isUUID(body.operator_id))return fail(400,'Invalid assignee');
    const {data}=await rest('fsp_operators','?select=user_id&active=eq.true&user_id=eq.'+escapeQuery(body.operator_id)+'&limit=1');
    if(!(data as any[])?.length)return fail(400,'Operator not active');
    patch.assigned_to=body.operator_id;
  }
  if(action==='note'){
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)return fail(400,'Note must contain 1–4000 characters');
    await callSupabase('/rest/v1/fsp_operator_audit',{method:'POST',body:{operator_id:op.user_id,conversation_id:id,action:'note',details:{text:body.text.trim()}},prefer:'return=minimal'});
  } else {
    let filter='?id=eq.'+escapeQuery(id);
    if(!allowAll(op))filter+='&assigned_to=eq.'+escapeQuery(op.user_id);
    // Provider payload never triggers a customer message, only internal state.
    const out=await callSupabase<any[]>('/rest/v1/whatsapp_conversations'+filter,{method:'PATCH',body:patch,prefer:'return=representation'});
    if(!out.data || out.data.length!==1)return fail(409,'Conversation changed; refresh');
    await callSupabase('/rest/v1/fsp_operator_audit',{method:'POST',body:{operator_id:op.user_id,conversation_id:id,action,details:action==='assign'?{operator_id:body.operator_id}:{}},prefer:'return=minimal'});
  }
  return respond(200,{ok:true,action});
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  const route=resolveFspRoute(req.url);
  if(!route)return fail(400,'Invalid route');
  const {path}=route;
  if(path==='/healthz'&&req.method==='GET')return respond(200,{ok:true,environment:'staging',messaging:'disabled',auth_required:true});
  if(!path.startsWith('/api/'))return fail(404,'Not found');
  if(!configured())return fail(503,'Staging backend is not configured');
  try {
    const identity=await getAuthOperator(req);
    if('status'in identity)return fail(identity.status as number,identity.error as string);
    if(req.method==='GET')return await getApi(req,path,identity.op,route.url);
    if(req.method==='POST')return await postApi(req,path,identity.op);
    return fail(405,'Method not allowed');
  }catch(e){
    console.error('FSP staging backend request failed',e instanceof Error?e.name:'unknown');
    return fail(503,'Staging backend temporarily unavailable');
  }
});