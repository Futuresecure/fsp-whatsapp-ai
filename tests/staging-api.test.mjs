import {test} from 'node:test';
import assert from 'node:assert/strict';
const USER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
let handler;
let scenario={valid:false,provisioned:false,role:'admin'};
globalThis.Deno={env:{get(k){return ({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEYS:'{"default":"sb_secret_test_secret_example_00000000"}',SUPABASE_PUBLISHABLE_KEYS:'{"default":"sb_publishable_test_dummy"}'})[k]}},serve(fn){handler=fn}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
 const u=new URL(String(input));
 const json=(v,headers={})=>new Response(JSON.stringify(v),{status:200,headers:{'content-type':'application/json',...headers}});
 if(u.pathname.endsWith('/auth/v1/user'))return scenario.valid?json({id:USER,is_anonymous:false}):new Response('{}',{status:401});
 if(u.pathname.includes('fsp_operators'))return json(scenario.provisioned?[{user_id:USER,role:scenario.role,active:true,display_name:'Fictional Operator'}]:[]);
 if(u.pathname.includes('whatsapp_conversations')){
  if(u.searchParams.get('id'))return json([{id:OTHER,contact_id:USER,assigned_to:OTHER,status:'open',ai_enabled:false,unread_count:0}]);
  return json([],{"content-range":"*/0"});
 }
 if(u.pathname.includes('whatsapp_contacts')||u.pathname.includes('whatsapp_messages'))return json([],{"content-range":"*/0"});
 return new Response('{}',{status:404});
};
await import('../test-dist/index.js');
const request=(path,method='GET',body)=>handler(new Request('https://example.supabase.co/functions/v1/fsp-connect-staging-api'+path,{method,headers:{...(method==='POST'?{'content-type':'application/json'}:{}),authorization:'Bearer fake-access-token'},body:body===undefined?undefined:JSON.stringify(body)}));
test('health endpoint is public and says messaging disabled',async()=>{const r=await request('/healthz');assert.equal(r.status,200);const d=await r.json();assert.equal(d.messaging,'disabled')});
test('preflight does not reveal data',async()=>{const r=await request('/api/me','OPTIONS');assert.equal(r.status,204)});
test('invalid JWT rejected with 401',async()=>{scenario={valid:false,provisioned:false,role:'admin'};const r=await request('/api/me');assert.equal(r.status,401)});
test('unprovisioned valid JWT rejected with 403',async()=>{scenario={valid:true,provisioned:false,role:'admin'};const r=await request('/api/me');assert.equal(r.status,403)});
test('provisioned admin can read own role',async()=>{scenario={valid:true,provisioned:true,role:'admin'};const r=await request('/api/me');assert.equal(r.status,200);assert.equal((await r.json()).role,'admin')});
test('Dashboard returns actual empty records without synthetic contacts',async()=>{scenario={valid:true,provisioned:true,role:'admin'};const r=await request('/api/dashboard');assert.equal(r.status,200);assert.equal((await r.json()).conversations,0)});
test('agent cannot read unassigned conversation by UUID',async()=>{scenario={valid:true,provisioned:true,role:'agent'};const r=await request('/api/conversations/'+OTHER);assert.equal(r.status,404)});
test('viewer cannot modify unassigned conversations',async()=>{scenario={valid:true,provisioned:true,role:'viewer'};const r=await request('/api/conversations/'+OTHER+'/actions','POST',{action:'note',text:'test'});assert.equal(r.status,403)});
test('staging settings remain disabled',async()=>{scenario={valid:true,provisioned:true,role:'admin'};const r=await request('/api/settings');assert.equal(r.status,200);const d=await r.json();assert.equal(d.sending,false);assert.equal(d.ai_auto_reply,false);assert.equal(d.bulk_broadcast,false)});
test('no sending endpoint exists',async()=>{scenario={valid:true,provisioned:true,role:'admin'};assert.equal((await request('/api/send','POST',{})).status,404)});
test('missing routes do not expose admin secrets',async()=>{const r=await request('/unexpected');assert.equal(r.status,404);assert.doesNotMatch(await r.text(),/sb_secret/)});
process.on('exit',()=>{globalThis.fetch=originalFetch});