import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOperationalAlerts,ALERT_CATEGORIES} from '../supabase/functions/fsp-connect-staging-api/operations-core.mjs';
const NOW=Date.parse('2026-10-30T06:00:00.000Z');
const heartbeat=(age)=>({last_run_at:new Date(NOW-age).toISOString(),open_alerts:1});

test('fresh heartbeat and no incidents reports healthy status',()=>{
 const out=summarizeOperationalAlerts({heartbeat:heartbeat(2*60_000),now:NOW});
 assert.equal(out.monitor_fresh,true);
 assert.equal(out.open_count,0);
 assert.equal(out.critical_count,0);
 assert.equal(out.external_notifications,false);
 assert.equal(out.sending_enabled,false);
});
test('missing and stale cron monitor must never look healthy',()=>{
 for(const h of [null,heartbeat(16*60_000)]){
  const out=summarizeOperationalAlerts({heartbeat:h,now:NOW});
  assert.equal(out.monitor_fresh,false);
 }
});
test('future heartbeat too far ahead is rejected',()=>{
 const out=summarizeOperationalAlerts({heartbeat:heartbeat(-120_000),now:NOW});
 assert.equal(out.monitor_fresh,false);
});
test('output includes safe classification only, never PII, message content or secret',()=>{
 const row={category:'reply_uncertain',severity:'critical',occurrences:4,
  first_seen_at:'2026-10-30T05:00:00Z',last_seen_at:'2026-10-30T05:40:00Z',
  phone_number:'919999999999',body:'private message',token:'sk-super-secret',source_id:'source-id-private'};
 const out=summarizeOperationalAlerts({rows:[row],openCount:1,criticalCount:1,heartbeat:heartbeat(3*60_000),now:NOW});
 const json=JSON.stringify(out);
 assert.equal(out.alerts[0].label,ALERT_CATEGORIES.reply_uncertain);
 assert.equal(out.critical_count,1);
 for(const secret of ['919999999999','private message','sk-super-secret','source-id-private'])
  assert.equal(json.includes(secret),false,secret);
});
test('unknown category cannot appear on dashboard',()=>{
 const out=summarizeOperationalAlerts({rows:[{category:'<script>alert(1)</script>',severity:'critical',source_id:'x'}],heartbeat:heartbeat(0),now:NOW});
 assert.equal(out.alerts.length,0);
});
test('operational alert list bounded to 25 rows',()=>{
 const rows=Array.from({length:100},()=>({category:'webhook_dead',severity:'critical',occurrences:1}));
 const out=summarizeOperationalAlerts({rows,openCount:100,criticalCount:100,heartbeat:heartbeat(0),now:NOW});
 assert.equal(out.alerts.length,25);
 assert.equal(out.open_count,100);
});
test('invalid counts cannot hide actual incidents',()=>{
 const rows=[{category:'provider_failed',severity:'warning',occurrences:-100}];
 const out=summarizeOperationalAlerts({rows,openCount:-1,criticalCount:-5,heartbeat:null,now:NOW});
 assert.equal(out.open_count,1);
 assert.equal(out.critical_count,0);
 assert.equal(out.alerts[0].occurrences,1);
});
