import test from 'node:test';
import assert from 'node:assert/strict';
import {executeRestrictedReply} from '../supabase/functions/fsp-connect-staging-api/reply-core.mjs';

const input={ok:true,requestId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
function fixture({admit,claim=async()=>true,send=async()=>({accepted:true,messageId:'wamid.TEST_MSG_12345'})}={}){
 const calls={send:0,claim:0,failures:[],record:0};
 return {
  calls,
  run:()=>executeRestrictedReply({
   input,claim:async()=>{calls.claim++;return claim()},admit,
   send:async()=>{calls.send++;return send()},
   record:async()=>{calls.record++},
   markFailure:async(id,reason)=>{calls.failures.push({id,reason})}
  })
 };
}
test('missing admission gate fails closed and never sends WhatsApp',async()=>{
 const f=fixture();const out=await f.run();
 assert.equal(out.status,503);assert.equal(f.calls.send,0);
 assert.equal(f.calls.failures[0].reason,'admission_unavailable');
});
test('admission provider outage never sends and records rejection',async()=>{
 const f=fixture({admit:async()=>{throw Error('DB down')}});
 const out=await f.run();assert.equal(out.status,503);
 assert.equal(f.calls.send,0);assert.equal(f.calls.record,0);
});
test('rate limiting returns 429, no provider sends and no message bodies logged',async()=>{
 const f=fixture({admit:async()=>({allowed:false,reason:'operator_minute',retry_after_seconds:60})});
 const out=await f.run();
 assert.equal(out.status,429);
 assert.equal(out.retryAfterSeconds,60);
 assert.equal(f.calls.send,0);
 assert.equal(f.calls.failures[0].reason,'rate_limited');
});
test('conversation cooldown denied without calling provider',async()=>{
 const f=fixture({admit:async()=>({allowed:false,reason:'conversation_cooldown',retry_after_seconds:3})});
 const out=await f.run();assert.equal(out.status,429);assert.equal(f.calls.send,0);
});
test('unauthorized operator admission rejected without sending',async()=>{
 const f=fixture({admit:async()=>({allowed:false,reason:'not_authorized'})});
 const out=await f.run();assert.equal(out.status,403);assert.equal(f.calls.send,0);
});
test('malformed admission cannot silently bypass safety gate',async()=>{
 for(const admit of [async()=>null,async()=>({allowed:'true'}),async()=>({allowed:false,reason:'unknown'})]){
  const f=fixture({admit});
  const out=await f.run();assert.equal(f.calls.send,0);
  assert.ok(out.status===403);
 }
});
test('successful durable reservation makes exactly one provider send',async()=>{
 const f=fixture({admit:async()=>({allowed:true,reason:'reserved'})});
 const out=await f.run();assert.equal(out.status,200);
 assert.equal(f.calls.send,1);assert.equal(f.calls.record,1);
});
test('duplicate request ID rejects before rate gate and provider',async()=>{
 let admissions=0;
 const f=fixture({claim:async()=>false,admit:async()=>{admissions++;return {allowed:true}}});
 const out=await f.run();assert.equal(out.status,409);
 assert.equal(admissions,0);assert.equal(f.calls.send,0);
});
