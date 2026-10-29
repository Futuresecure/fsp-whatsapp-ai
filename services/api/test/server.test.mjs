import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createAppServer,verifyWebhookSignature} from '../src/server.mjs';
import {normalizeMetaEvents} from '../src/events.mjs';
import {processBatch} from '../src/worker.mjs';
import {createSupabaseGateway} from '../src/supabase.mjs';
const id='550e8400-e29b-41d4-a716-446655440000';
const user='550e8400-e29b-41d4-a716-446655440001';
const assigned='550e8400-e29b-41d4-a716-446655440002';
const fixture={object:'whatsapp_business_account',entry:[{id:'12345678',changes:[{field:'messages',value:{
 metadata:{phone_number_id:'123456'},contacts:[{wa_id:'919876543210',profile:{name:'Example User'}}],
 messages:[{id:'wamid.test_1',from:'919876543210',timestamp:'1793250000',type:'text',text:{body:'வணக்கம்'}}]
}}]}]};
function makeGateway({role='admin',active=true,actor=user,save=true,accessible=true}={}){
  const calls=[];
  return {calls,verifyUser:async token=>token==='valid'?{id:actor,is_anonymous:false}:null,
    table:async(name,query='',opts={})=>{
      calls.push({name,query,opts});
      if(name==='fsp_operators')return query.includes('user_id=eq.'+assigned)?[{user_id:assigned,role:'agent',active:true}]:[{user_id:actor,role,active}];
      if(name==='whatsapp_conversations'){
        if(opts.method==='PATCH')return [{id}];
        return query.startsWith('?select=contact_id')?[{contact_id:id}]:[{id,assigned_to:accessible?actor:assigned,contact_id:id,status:'open'}];
      }
      if(name==='whatsapp_contacts'||name==='whatsapp_messages')return [];
      return [];
    },rpc:async(name,args)=>{
      calls.push({name,args});
      if(name==='fsp_enqueue_events'&&!save)throw new Error('db offline');
      return name==='fsp_claim_events'?[]:1;
    }};
}
async function withServer(gateway,fn){
 const s=createAppServer({verifyToken:'test-verification-token',appSecret:'test-app-secret',gateway});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{return await fn('http://127.0.0.1:'+s.address().port);}finally{await new Promise(r=>s.close(r));}
}
function sign(body){return 'sha256='+createHmac('sha256','test-app-secret').update(body).digest('hex');}
function post(base,body,signature=sign(body)){
 return fetch(base+'/webhooks/whatsapp',{method:'POST',body,headers:{'x-hub-signature-256':signature}});
}
const json=JSON.stringify(fixture);
test('healthz and readyz do not confuse missing database with liveness',async()=>withServer(null,async base=>{
 assert.equal((await fetch(base+'/healthz')).status,200);
 assert.equal((await fetch(base+'/readyz')).status,503);
}));
test('valid challenge, wrong token and wrong mode',async()=>withServer(null,async base=>{
 const u=new URL(base+'/webhooks/whatsapp');
 u.searchParams.set('hub.mode','subscribe');u.searchParams.set('hub.verify_token','test-verification-token');u.searchParams.set('hub.challenge','challenge-123');
 assert.equal(await (await fetch(u)).text(),'challenge-123');
 u.searchParams.set('hub.verify_token','bad');assert.equal((await fetch(u)).status,403);
 u.searchParams.set('hub.verify_token','test-verification-token');u.searchParams.set('hub.mode','other');assert.equal((await fetch(u)).status,403);
}));
test('HMAC over raw request bytes and no premature ACK',async()=>withServer(null,async base=>{
 assert.equal(verifyWebhookSignature(Buffer.from(json),sign(json),'test-app-secret'),true);
 assert.equal(verifyWebhookSignature(Buffer.from('{}'),sign(json),'test-app-secret'),false);
 assert.equal((await post(base,json)).status,503);
 assert.equal((await post(base,json,'sha256='+'0'.repeat(64))).status,403);
 assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'POST',body:json})).status,403);
}));
test('durable enqueue before ACK; DB error must retry',async()=>{
 const g=makeGateway();await withServer(g,async base=>{
   assert.equal((await post(base,json)).status,200);
   assert.equal(g.calls.find(c=>c.name==='fsp_enqueue_events').args.p_events[0].event_key,'message:wamid.test_1');
   assert.equal((await fetch(base+'/readyz')).status,200);
 });
 await withServer(makeGateway({save:false}),async base=>assert.equal((await post(base,json)).status,503));
});
test('invalid JSON / unsupported event / invalid method',async()=>withServer(makeGateway(),async base=>{
 assert.equal((await post(base,'not json')).status,400);
 assert.equal((await post(base,JSON.stringify({object:'other',entry:[]}))).status,400);
 assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'PUT'})).status,405);
 assert.equal((await fetch(base+'/invalid')).status,404);
}));
test('normalization does not imply marketing consent and retains media IDs only',()=>{
 const n=normalizeMetaEvents(fixture);assert.equal(n.length,1);
 assert.equal(n[0].payload.body,'வணக்கம்');assert.equal('opted_in' in n[0].payload,false);
 const st=structuredClone(fixture);delete st.entry[0].changes[0].value.messages;
 st.entry[0].changes[0].value.statuses=[{id:'wamid.test_1',status:'read',timestamp:'1793250000'}];
 assert.equal(normalizeMetaEvents(st)[0].event_type,'status');
 assert.equal(normalizeMetaEvents(st)[0].event_key,normalizeMetaEvents(st)[0].event_key);
});
test('worker does not use in-memory ACK or lose failed DB work',async()=>{
 const db=makeGateway();db.rpc=async(name)=>name==='fsp_claim_events'?[{id,lease_token:user}]:name==='fsp_process_event'?'completed':null;
 assert.deepEqual(await processBatch(db),[{id,status:'completed'}]);
 db.rpc=async(name)=>name==='fsp_claim_events'?[{id,lease_token:user}]:Promise.reject(new Error('db down'));
 assert.deepEqual(await processBatch(db),[{id,status:'upstream_error'}]);
});
test('operator API rejects missing token, invalid token, inactive operator',async()=>{
 await withServer(makeGateway(),async base=>{
   assert.equal((await fetch(base+'/api/me')).status,401);
   assert.equal((await fetch(base+'/api/me',{headers:{Authorization:'Bearer bad'}})).status,401);
 });
 await withServer(makeGateway({active:false}),async base=>{
   assert.equal((await fetch(base+'/api/me',{headers:{Authorization:'Bearer valid'}})).status,403);
 });
});
test('agent and viewer cannot read unassigned conversation or mutate',async()=>{
 await withServer(makeGateway({role:'agent',accessible:false}),async base=>{
   assert.equal((await fetch(base+'/api/conversations/'+id,{headers:{Authorization:'Bearer valid'}})).status,404);
 });
 await withServer(makeGateway({role:'viewer'}),async base=>{
   assert.equal((await fetch(base+'/api/conversations/'+id+'/actions',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({action:'resolve'})})).status,403);
 });
});
test('agent denied assign, admin allows note but no outgoing message',async()=>{
 await withServer(makeGateway({role:'agent'}),async base=>{
  assert.equal((await fetch(base+'/api/conversations/'+id+'/actions',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({action:'assign',operator_id:assigned})})).status,403);
 });
 const g=makeGateway();await withServer(g,async base=>{
  const resp=await fetch(base+'/api/conversations/'+id+'/actions',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({action:'note',text:'Internal test only'})});
  assert.equal(resp.status,200);
  assert.equal(g.calls.filter(c=>c.name==='whatsapp_messages').length,0);
  assert.equal(g.calls.filter(c=>c.name==='fsp_operator_audit').length,1);
 });
});
test('gateway verification uses auth user endpoint and does not trust raw JWT claims',async()=>{
 const calls=[];
 const g=createSupabaseGateway({url:'https://example.supabase.co',secretKey:'not-real-secret',publishableKey:'not-real-key',fetchImpl:async(url,opts)=>{
  calls.push({url,opts});return {ok:true,status:200,text:async()=>JSON.stringify({id:user,is_anonymous:false})};
 }});
 assert.equal((await g.verifyUser('not-real-token')).id,user);
 assert.ok(calls[0].url.endsWith('/auth/v1/user'));
 assert.equal(calls[0].opts.headers.authorization,'Bearer not-real-token');
});


test('signed invalid payload is rejected without database write',async()=>{
 const g=makeGateway();await withServer(g,async base=>{
  const bad=JSON.stringify({...fixture,entry:[{id:'123',changes:[{field:'messages',value:{messages:[{id:'invalid',from:'bad',type:'text'}]}}]}]});
  assert.equal((await post(base,bad)).status,400);
  assert.equal(g.calls.filter(c=>c.name==='fsp_enqueue_events').length,0);
 });
});

test('oversized webhook is rejected before database persistence',async()=>{
 const g=makeGateway();await withServer(g,async base=>{
  const large=JSON.stringify({object:'whatsapp_business_account',data:'x'.repeat(512*1024)});
  assert.equal((await post(base,large)).status,413);
  assert.equal(g.calls.filter(c=>c.name==='fsp_enqueue_events').length,0);
 });
});

test('read-only role cannot assign or pause AI',async()=>{
 const g=makeGateway({role:'viewer'});
 await withServer(g,async base=>{
  for(const action of ['assign','pause_ai','note']) {
    const resp=await fetch(base+'/api/conversations/'+id+'/actions',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({action,operator_id:assigned,text:'Test'})});
    assert.equal(resp.status,403);
  }
 });
});

test('new operator sees only assigned conversations',async()=>{
 const g=makeGateway({role:'agent'});await withServer(g,async base=>{
  const res=await fetch(base+'/api/conversations',{headers:{Authorization:'Bearer valid'}});
  assert.equal(res.status,200);
  assert.ok(g.calls.some(c=>c.name==='whatsapp_conversations'&&c.query.includes('assigned_to=eq.'+user)));
 });
});


test('Supabase REST writes with empty 201 body do not cause false failure',async()=>{
 const g=createSupabaseGateway({url:'https://example.supabase.co',secretKey:'server-secret',publishableKey:'browser-publishable',fetchImpl:async()=>({ok:true,status:201,text:async()=>''})});
 assert.equal(await g.table('fsp_operator_audit','',{method:'POST',body:{action:'note'}}),null);
});