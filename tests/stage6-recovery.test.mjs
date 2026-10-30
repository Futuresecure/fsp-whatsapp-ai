import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRecoveryPreflight} from '../supabase/functions/fsp-connect-staging-api/recovery-core.mjs';
const baseline={
 contacts:1,conversations:1,messages:3,outbound_requests:1,
 orphan_messages:0,orphan_conversations:0,
 orphan_reply_requests:0,orphan_rate_reservations:0,
 backup_artifact_verified:true,independent_restore_verified:true
};
test('healthy relationships are not confused with an actual backup',()=>{
 const x=summarizeRecoveryPreflight(baseline);
 assert.equal(x.relational_integrity,'pass');
 assert.equal(x.backup_artifact_verified,false);
 assert.equal(x.independent_restore_verified,false);
 assert.equal(x.production_recovery_ready,false);
 assert.equal(x.external_backup_status,'unverified');
});
test('missing database results must fail closed',()=>{
 const x=summarizeRecoveryPreflight(null);
 assert.equal(x.relational_integrity,'unverified');
 assert.equal(x.counts.messages,null);
});
test('orphaned conversation or message blocks relational preflight',()=>{
 for(const key of ['orphan_messages','orphan_conversations','orphan_reply_requests','orphan_rate_reservations']){
  const x=summarizeRecoveryPreflight({...baseline,[key]:1});
  assert.equal(x.relational_integrity,'blocked',key);
 }
});
test('invalid counts do not pass the integrity check',()=>{
 for(const contacts of [-1,1.5,'1',null]){
  const x=summarizeRecoveryPreflight({...baseline,contacts});
  assert.equal(x.relational_integrity,'unverified');
 }
});
test('never expose PII, access tokens or source rows',()=>{
 const x=summarizeRecoveryPreflight({...baseline,
   personalPhone:'private-number-canary',messageBody:'private-message-canary',
   access_token:'private-token-canary',email:'private-email-canary'});
 const output=JSON.stringify(x);
 for(const v of ['private-number-canary','private-message-canary','private-token-canary','private-email-canary'])
  assert.equal(output.includes(v),false);
});
test('view of recovery never returns any write command',()=>{
 const x=summarizeRecoveryPreflight(baseline);
 assert.equal('restore' in x,false);
 assert.equal('download' in x,false);
 assert.equal('delete' in x,false);
});
