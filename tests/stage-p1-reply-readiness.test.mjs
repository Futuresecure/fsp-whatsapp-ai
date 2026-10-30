import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectReplyRollout} from '../supabase/functions/fsp-connect-staging-api/reply-readiness.mjs';

const configured={accessToken:'A'.repeat(50),phoneNumberId:'1248446071686225',testRecipient:'919988776655',testSendingEnabled:true};

test('connected restricted sandbox can be test-ready without ever being production-ready',()=>{
 const status=inspectReplyRollout(configured);
 assert.equal(status.mode,'test_recipient_only');
 assert.equal(status.checks.restricted_test_sending,true);
 assert.equal(status.production_ready,false);
 assert.equal(status.checks.production_customer_sending,false);
 assert.ok(status.blockers.length>=3);
});

test('missing provider token blocks test sending',()=>{
 const status=inspectReplyRollout({...configured,accessToken:''});
 assert.equal(status.checks.restricted_test_sending,false);
 assert.equal(status.production_ready,false);
});

test('an unknown test number or disabled flag blocks test sending',()=>{
 assert.equal(inspectReplyRollout({...configured,testRecipient:'not-a-number'}).checks.restricted_test_sending,false);
 assert.equal(inspectReplyRollout({...configured,testSendingEnabled:false}).checks.restricted_test_sending,false);
});

test('never echoes any credentials or recipient numbers',()=>{
 const result=JSON.stringify(inspectReplyRollout(configured));
 assert.ok(!result.includes(configured.accessToken));
 assert.ok(!result.includes(configured.testRecipient));
 assert.ok(!result.includes(configured.phoneNumberId));
});

test('reports operator and service-window restrictions as enforced',()=>{
 const result=inspectReplyRollout(configured);
 assert.equal(result.checks.operator_authorization,true);
 assert.equal(result.checks.incoming_24h_window_enforced,true);
 assert.equal(result.checks.idempotent_claim_before_send,true);
});
