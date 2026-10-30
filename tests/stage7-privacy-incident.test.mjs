import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRetentionInventory,RETENTION_CATEGORIES}
 from '../supabase/functions/fsp-connect-staging-api/privacy-core.mjs';
import {assessIncidentReadiness}
 from '../supabase/functions/fsp-connect-staging-api/incident-core.mjs';

const names=Object.keys(RETENTION_CATEGORIES);
const data=names.map(category=>({
 category,total:11,older_30_days:8,older_90_days:3,older_365_days:1,
 personal_message:'TEST_PRIVATE_MESSAGE',customer_phone:'919999999999',token:'SK_TEST_PRIVATE'
}));
const now=Date.parse('2026-10-30T07:00:00Z');
test('retention inventory handles all approved categories with strictly monotonic age buckets',()=>{
 const s=summarizeRetentionInventory({categories:data});
 assert.equal(s.inventory_complete,true);
 assert.equal(s.categories.length,names.length);
 assert.ok(s.categories.every(x=>x.status==='verified_count'));
 assert.equal(s.retention_policy_approved,false);
 assert.equal(s.automatic_deletion_enabled,false);
 assert.equal(s.production_privacy_ready,false);
});
test('unknown category, duplicate category, and raw private fields are excluded',()=>{
 const s=summarizeRetentionInventory({categories:[...data,data[0],
  {category:'<script>alert(1)</script>',total:1}]});
 assert.equal(s.categories.length,names.length);
 const json=JSON.stringify(s);
 for(const needle of ['TEST_PRIVATE_MESSAGE','919999999999','SK_TEST_PRIVATE','<script>'])
  assert.equal(json.includes(needle),false);
});
test('missing, invalid, negative and inconsistent age buckets fail closed',()=>{
 for(const modification of [
  {total:-1},{older_30_days:12},{older_90_days:9},{older_365_days:4},
  {older_90_days:'3'}, {older_365_days:null}
 ]){
  const rows=data.map(d=>({...d}));
  rows[0]={...rows[0],...modification};
  const s=summarizeRetentionInventory({categories:rows});
  assert.equal(s.inventory_complete,false);
  assert.ok(s.categories.some(x=>x.status==='unverified'));
 }
});
test('empty data cannot be called privacy ready',()=>{
 const s=summarizeRetentionInventory(null);
 assert.equal(s.inventory_complete,false);
 assert.equal(s.retention_policy_approved,false);
 assert.equal(s.categories.length,0);
});
test('healthy incident metrics still cannot imply incident response approval',()=>{
 const x=assessIncidentReadiness({
  monitorLastRun:'2026-10-30T06:58:00Z',openAlerts:0,
  criticalAlerts:0,webhookBacklog:0,now
 });
 assert.equal(x.assessment,'no_current_incident_detected');
 assert.equal(x.monitoring_fresh,true);
 assert.equal(x.incident_owner_assigned,false);
 assert.equal(x.live_response_drill_verified,false);
 assert.equal(x.production_incident_response_ready,false);
 assert.equal(x.can_send_messages,false);
});
test('stale, missing and future monitor heartbeats trigger manual attention',()=>{
 for(const time of [null,'2026-10-30T06:40:00Z','2026-10-30T07:10:00Z']){
  const x=assessIncidentReadiness({monitorLastRun:time,openAlerts:0,criticalAlerts:0,webhookBacklog:0,now});
  assert.equal(x.assessment,'manual_attention_required');
  assert.equal(x.monitoring_fresh,false);
 }
});
test('critical incidents and webhook backlog trigger manual attention',()=>{
 for(const data of [{criticalAlerts:1},{webhookBacklog:5},{openAlerts:null}]){
  const x=assessIncidentReadiness({
   monitorLastRun:'2026-10-30T06:59:00Z',openAlerts:0,criticalAlerts:0,webhookBacklog:0,...data,now
  });
  assert.equal(x.assessment,'manual_attention_required');
 }
});
test('incident response cannot send, automatically close or externally notify',()=>{
 const x=assessIncidentReadiness({});
 assert.equal(x.automatic_external_paging,false);
 assert.equal(x.cannot_close_incidents_automatically,true);
 assert.equal(x.can_send_messages,false);
 assert.equal(x.production_incident_response_ready,false);
});
test('extra source fields never expose PII',()=>{
 const s=assessIncidentReadiness({
  openAlerts:1,criticalAlerts:1,webhookBacklog:1,
  personal_data:'DO_NOT_LEAK',provider_token:'PRIVATE_META_KEY'
 });
 const json=JSON.stringify(s);
 assert.equal(json.includes('DO_NOT_LEAK'),false);
 assert.equal(json.includes('PRIVATE_META_KEY'),false);
});
