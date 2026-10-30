import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeOperatorCoverage} from '../supabase/functions/fsp-connect-staging-api/operator-readiness.mjs';
test('one admin reports live multi-account QA unverified, not passed',()=>{
 const result=summarizeOperatorCoverage({admin:1,manager:0,agent:0,viewer:0});
 assert.equal(result.total_active,1);
 assert.equal(result.represented_roles,1);
 assert.equal(result.independent_login_sessions_verified,false);
 assert.equal(result.production_multioperator_ready,false);
 assert.equal(result.can_modify_users,false);
});
test('missing or malformed role counts are unknown',()=>{
 const x=summarizeOperatorCoverage({admin:1,manager:'0',agent:-1,viewer:null});
 assert.equal(x.total_active,null);
 assert.equal(x.represented_roles,null);
 assert.equal(x.active_counts.manager,null);
});
test('many role accounts do not automatically satisfy live-session QA',()=>{
 const x=summarizeOperatorCoverage({admin:2,manager:4,agent:9,viewer:3});
 assert.equal(x.total_active,18);
 assert.equal(x.independent_login_sessions_verified,false);
 assert.equal(x.production_multioperator_ready,false);
});
test('unrecognized source metadata never leaks',()=>{
 const x=summarizeOperatorCoverage({admin:1,manager:0,agent:0,viewer:0,
  sensitiveSecret:'SECRET_MARKER_CANARY',userEmail:'PRIVATE_MAIL_CANARY'});
 const result=JSON.stringify(x);
 assert.equal(result.includes('SECRET_MARKER_CANARY'),false);
 assert.equal(result.includes('PRIVATE_MAIL_CANARY'),false);
});
