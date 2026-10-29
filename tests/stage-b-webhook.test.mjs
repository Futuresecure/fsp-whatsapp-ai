import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createWebhookHandler,verifyMetaHmac} from '../supabase/functions/fsp-whatsapp-webhook/core.mjs';
const secret='unit-test-meta-secret-do-not-use-in-production';
const verifyToken='dummy-verification-token-very-long';
const url='https://project.supabase.co/functions/v1/fsp-whatsapp-webhook';
const fixture={object:'whatsapp_business_account',entry:[{id:'123456',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:'777'},contacts:[{wa_id:'919111222333',profile:{name:'Fictional Tester'}}],messages:[{id:'wamid.test-123',from:'919111222333',timestamp:'1793260000',type:'text',text:{body:'Hello'}}]}}]}]};
const body=JSON.stringify(fixture);
const signature=b=>'sha256='+createHmac('sha256',secret).update(b).digest('hex');
const handler=(opts={})=>{let recorded=[];const config=()=>({appSecret:secret,verifyToken,ready:true,wabaId:'123456',phoneNumberId:'777',...opts.config});return {handle:createWebhookHandler({config,enqueue:async e=>{if(opts.fail)throw Error('DB down');recorded.push(...e);return e.length;}}),recorded};};
const post=(b=body,sig=signature(b))=>new Request(url,{method:'POST',headers:{'x-hub-signature-256':sig,'content-type':'application/json'},body:b});

test('GET challenge echoes only correct verify token',async()=>{
 const {handle}=handler();
 let r=await handle(new Request(url+'?hub.mode=subscribe&hub.verify_token='+verifyToken+'&hub.challenge=123test'));
 assert.equal(r.status,200);assert.equal(await r.text(),'123test');
 r=await handle(new Request(url+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123test'));
 assert.equal(r.status,403);
});
test('no secret configuration fails closed for verification and delivery',async()=>{
 const {handle}=handler({config:{ready:false}});
 assert.equal((await handle(new Request(url+'?hub.mode=subscribe&hub.verify_token='+verifyToken+'&hub.challenge=a'))).status,503);
 assert.equal((await handle(post())).status,503);
});
test('valid POST is normalized and durably acknowledged',async()=>{
 const {handle,recorded}=handler();const r=await handle(post());
 assert.equal(r.status,200);assert.equal(await r.text(),'EVENT_RECEIVED');
 assert.equal(recorded.length,1);assert.equal(recorded[0].event_key,'message:wamid.test-123');
 assert.equal(recorded[0].payload.wa_id,'919111222333');
});
test('missing or forged signature returns 403 without enqueue',async()=>{
 const h=handler();assert.equal((await h.handle(post(body,''))).status,403);
 assert.equal((await h.handle(post(body,signature('modified')))).status,403);
 assert.equal(h.recorded.length,0);
});
test('signed but invalid JSON is rejected',async()=>{
 const h=handler();assert.equal((await h.handle(post('{',signature('{')))).status,400);
});
test('incorrect waba and phone are rejected',async()=>{
 const wrong=JSON.parse(body);wrong.entry[0].id='wrong';let b=JSON.stringify(wrong);
 assert.equal((await handler().handle(post(b,signature(b)))).status,403);
 const wrongPhone=JSON.parse(body);wrongPhone.entry[0].changes[0].value.metadata.phone_number_id='incorrect';b=JSON.stringify(wrongPhone);
 assert.equal((await handler().handle(post(b,signature(b)))).status,403);
});
test('DB outage yields 503, so Meta can retry',async()=>{
 const h=handler({fail:true});assert.equal((await h.handle(post())).status,503);
});
test('larger than 512KiB is rejected',async()=>{
 const tooLarge='X'.repeat(512*1024+1);
 const r=await handler().handle(post(tooLarge,signature(tooLarge)));
 assert.equal(r.status,413);
});
test('signature is cryptographically checked on exact raw bytes',async()=>{
 const bytes=new TextEncoder().encode(body);
 assert.equal(await verifyMetaHmac(bytes,signature(body),secret),true);
 assert.equal(await verifyMetaHmac(bytes,signature(body+' '),secret),false);
 assert.equal(await verifyMetaHmac(bytes,null,secret),false);
});
test('only recognized HTTP methods accepted',async()=>{
 const r=await handler().handle(new Request(url,{method:'DELETE'}));assert.equal(r.status,405);
});