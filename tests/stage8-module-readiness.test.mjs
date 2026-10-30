import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeModuleReadiness} from '../supabase/functions/fsp-connect-staging-api/module-readiness.mjs';

test('empty project shows zero records while all unsafe execution remains disabled',()=>{
 const x=summarizeModuleReadiness({aiSettings:0,aiConfigsEnabled:0,flowDrafts:0,activeFlows:0,optedInContacts:0,allContacts:0});
 assert.equal(x.ai_assistant.configurations,0);
 assert.equal(x.automation.saved_flows,0);
 assert.equal(x.broadcast.recorded_opt_in_contacts,0);
 assert.equal(x.sending_enabled,false);
 assert.equal(x.ai_assistant.auto_reply_enabled,false);
 assert.equal(x.automation.execution_engine_enabled,false);
 assert.equal(x.broadcast.bulk_sender_enabled,false);
});
test('config, approved consent or active flow row never enables a provider send',()=>{
 const x=summarizeModuleReadiness({aiSettings:2,aiConfigsEnabled:2,flowDrafts:3,
  activeFlows:2,optedInContacts:100,allContacts:300});
 assert.equal(x.ai_assistant.enabled_records,2);
 assert.equal(x.automation.active_database_records,2);
 assert.equal(x.broadcast.recorded_opt_in_contacts,100);
 assert.equal(x.ai_assistant.ready,false);
 assert.equal(x.automation.ready,false);
 assert.equal(x.broadcast.ready,false);
 assert.equal(x.broadcast.scheduled_sender_enabled,false);
});
test('negative/malformed metrics are unverified rather than safe',()=>{
 const x=summarizeModuleReadiness({aiSettings:-1,flowDrafts:'10',optedInContacts:null});
 assert.equal(x.ai_assistant.configurations,null);
 assert.equal(x.automation.saved_flows,null);
 assert.equal(x.broadcast.recorded_opt_in_contacts,null);
});
test('no secret or customer data survives raw module readiness input',()=>{
 const x=summarizeModuleReadiness({aiSettings:1,flowDrafts:1,optedInContacts:0,
  message_body:'PRIVATE_INFORMATION',token:'PRIVATE_TOKEN',contact_number:'919888777666'});
 const v=JSON.stringify(x);
 for(const secret of ['PRIVATE_INFORMATION','PRIVATE_TOKEN','919888777666'])assert.equal(v.includes(secret),false);
});
