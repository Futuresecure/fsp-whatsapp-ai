import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProductionReadiness} from '../supabase/functions/fsp-connect-staging-api/release-gates.mjs';
const now=Date.parse('2026-10-30T06:20:00Z');
const base={activeOperators:1,inboundMessages:2,queuedOrDeadWebhooks:0,
 openCriticalAlerts:0,monitorLastRun:'2026-10-30T06:18:00Z',
 stagingTestRecipientReady:true,databaseRateLimitReady:true,now};
const status=(r,id)=>r.gates.find(x=>x.id===id)?.status;

test('staging can be healthy, but production sending must remain disabled',()=>{
 const x=evaluateProductionReadiness(base);
 assert.equal(x.production_customer_sending,false);
 assert.equal(x.production_ready,false);
 assert.equal(x.can_enable_production,false);
 assert.equal(status(x,'monitor_heartbeat'),'pass');
 assert.equal(status(x,'webhook_queue'),'pass');
 assert.equal(status(x,'production_send_path'),'blocked');
});
test('no operator, queued webhooks and critical incidents block go-live',()=>{
 const x=evaluateProductionReadiness({...base,activeOperators:0,queuedOrDeadWebhooks:3,openCriticalAlerts:2});
 for(const key of ['active_operator','webhook_queue','critical_alerts'])assert.equal(status(x,key),'blocked');
});
test('missing metrics and bad counts are never passed',()=>{
 const x=evaluateProductionReadiness({...base,inboundMessages:undefined,queuedOrDeadWebhooks:NaN,openCriticalAlerts:-4});
 for(const key of ['inbound_evidence','webhook_queue','critical_alerts'])assert.equal(status(x,key),'unverified');
});
test('stale, absent and future-dated heartbeat never count as healthy',()=>{
 for(const value of [null,'2026-10-30T05:45:00Z','2026-10-30T07:30:00Z'])
  assert.equal(status(evaluateProductionReadiness({...base,monitorLastRun:value}),'monitor_heartbeat'),'blocked');
});
test('staging allowlist and rate storage must both be available',()=>{
 const x=evaluateProductionReadiness({...base,stagingTestRecipientReady:false,databaseRateLimitReady:false});
 assert.equal(status(x,'staging_allowlist'),'blocked');
 assert.equal(status(x,'transactional_rate_gate'),'blocked');
});
test('real operator QA and restore remain unverified despite high counts',()=>{
 const x=evaluateProductionReadiness({...base,activeOperators:1000,inboundMessages:10000});
 for(const key of ['restore_drill','multi_operator_qa','controlled_pilot','retention_policy','repo_visibility'])
  assert.equal(status(x,key),'unverified');
});
test('gate count totals match all unique gate states',()=>{
 const x=evaluateProductionReadiness(base);
 assert.equal(x.results.pass+x.results.blocked+x.results.unverified,x.gates.length);
 assert.equal(new Set(x.gates.map(g=>g.id)).size,x.gates.length);
});
test('no unsupported source fields are exposed',()=>{
 const x=evaluateProductionReadiness({...base,unexpectedSecret:'canary-secret-123',unexpectedData:'canary-data-456'});
 const payload=JSON.stringify(x);
 assert.equal(payload.includes('canary-secret-123'),false);
 assert.equal(payload.includes('canary-data-456'),false);
});
