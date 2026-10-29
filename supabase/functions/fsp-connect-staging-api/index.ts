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
  'access-control-allow-origin':'*',
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
function pathOf(req:Request){const p=new URL(req.url).pathname; const prefix='/functions/v1/fsp-connect-staging-api';return p.startsWith(prefix)?(p.slice(prefix.length)||'/'):p;}
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
    const {data}=await rest('whatsapp_conversations','?select=id,contact_id,assigned_to,status,ai_enabled,unread_count,last_message_at,created_at'+scope+'&order=last_message_at.desc.nullslast'+pagination);
    return respond(200,{data,limit,offset});
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
async function postApi(req:Request,path:string,op:any):Promise<Response>{
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
  if(!['mark_read','resolve','reopen','takeover','pause_ai','assign','note'].includes(action))return fail(400,'Action not available in staging');
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
  const path=pathOf(req);
  if(path==='/healthz'&&req.method==='GET')return respond(200,{ok:true,environment:'staging',messaging:'disabled',auth_required:true});
  if(!path.startsWith('/api/'))return fail(404,'Not found');
  if(!configured())return fail(503,'Staging backend is not configured');
  try {
    const identity=await getAuthOperator(req);
    if('status'in identity)return fail(identity.status as number,identity.error as string);
    if(req.method==='GET')return await getApi(req,path,identity.op,new URL(req.url));
    if(req.method==='POST')return await postApi(req,path,identity.op);
    return fail(405,'Method not allowed');
  }catch(e){
    console.error('FSP staging backend request failed',e instanceof Error?e.name:'unknown');
    return fail(503,'Staging backend temporarily unavailable');
  }
});