import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeAnalytics} from '../supabase/functions/fsp-connect-staging-api/analytics-core.mjs';
const makeDays=n=>Array.from({length:n},(_,i)=>({day:'2026-10-'+String(i+1).padStart(2,'0'),messages:3,inbound:2,outbound:1,phone:'919888777666'}));
const valid={ok:true,scope:'assigned',days:7,conversations:1,contacts:1,messages:21,
 inbound:14,outbound:7,sent:1,delivered:1,read:4,failed:1,daily:makeDays(7),
 provider_token:'TEST_PRIVATE_CREDENTIAL',message_body:'private health content'};
test('valid aggregate report contains only allowlisted count fields',()=>{
 const x=sanitizeAnalytics(valid);
 assert.equal(x.ok,true);assert.equal(x.daily.length,7);assert.equal(x.scope,'assigned');
 const json=JSON.stringify(x);
 for(const secret of ['919888777666','TEST_PRIVATE_CREDENTIAL','private health content'])
  assert.equal(json.includes(secret),false);
});
test('invalid dates and contradictory daily totals are rejected',()=>{
 for(const change of [
   {day:'<script>',messages:3,inbound:2,outbound:1},
   {day:'2026-10-01',messages:3,inbound:4,outbound:1},
   {day:'2026-10-01',messages:-1,inbound:0,outbound:0}
 ]){
  const daily=[...valid.daily];daily[0]=change;
  assert.equal(sanitizeAnalytics({...valid,daily}).ok,false);
 }
});
test('invalid count, days or missing daily rows are rejected',()=>{
 for(const x of [
  {...valid,read:-1},
  {...valid,days:1000},
  {...valid,days:7,daily:valid.daily.slice(1)},
  {...valid,daily:null}
 ])assert.equal(sanitizeAnalytics(x).ok,false);
});
test('current provider status counts need not represent cumulative conversion funnel',()=>{
 const x=sanitizeAnalytics({...valid,sent:0,delivered:0,read:1});
 assert.equal(x.ok,true);assert.equal(x.totals.read,1);
});
test('fallback does not grant workspace scope if backend says assigned',()=>{
 const x=sanitizeAnalytics({...valid,scope:'untrusted'});
 assert.equal(x.ok,true);assert.equal(x.scope,'workspace');
});
