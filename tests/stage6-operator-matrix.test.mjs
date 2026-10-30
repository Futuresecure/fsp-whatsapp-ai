import test from 'node:test';
import assert from 'node:assert/strict';
import {
 isActiveOperator,hasWorkspaceAccess,canViewConversation,
 canPerformConversationAction,visibleConversationScope,canInspectAdminSettings
} from '../supabase/functions/fsp-connect-staging-api/operator-permissions.mjs';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user=(role,id=A,active=true)=>({user_id:id,role,active});
const mine={assigned_to:A};
const other={assigned_to:B};
const open={assigned_to:null};
test('admin and manager have workspace-wide read, modify and assignment access',()=>{
 for(const role of ['admin','manager']){
  const op=user(role);
  assert.equal(hasWorkspaceAccess(op),true);
  for(const c of [mine,other,open]){
   assert.equal(canViewConversation(op,c),true);
   for(const action of ['mark_read','auto_mark_read','resolve','reopen','takeover','pause_ai','note','reply','assign'])
    assert.equal(canPerformConversationAction(op,c,action),true,role+' '+action);
  }
  assert.equal(visibleConversationScope(op),'');
 }
});
test('assigned agent can modify assigned conversation but cannot assign work',()=>{
 const op=user('agent');
 assert.equal(canViewConversation(op,mine),true);
 for(const action of ['mark_read','auto_mark_read','resolve','reopen','takeover','pause_ai','note','reply'])
  assert.equal(canPerformConversationAction(op,mine,action),true,action);
 assert.equal(canPerformConversationAction(op,mine,'assign'),false);
 assert.equal(canViewConversation(op,other),false);
 assert.equal(canViewConversation(op,open),false);
 assert.equal(canPerformConversationAction(op,other,'reply'),false);
 assert.equal(visibleConversationScope(op),'&assigned_to=eq.'+A);
});
test('viewer sees only assigned conversations and can never mutate or send',()=>{
 const op=user('viewer');
 assert.equal(canViewConversation(op,mine),true);
 assert.equal(canViewConversation(op,other),false);
 for(const action of ['mark_read','auto_mark_read','resolve','reopen','takeover','pause_ai','note','reply','assign'])
  assert.equal(canPerformConversationAction(op,mine,action),false,action);
});
test('inactive and invalid operators fail closed even if role says admin',()=>{
 for(const op of [user('admin',A,false),user('superadmin'),null,{},user('agent','',true)]){
  assert.equal(isActiveOperator(op),false);
  assert.equal(hasWorkspaceAccess(op),false);
  assert.equal(canViewConversation(op,mine),false);
  assert.equal(canPerformConversationAction(op,mine,'reply'),false);
  assert.equal(visibleConversationScope(op),null);
  assert.equal(canInspectAdminSettings(op),false);
 }
});
test('only active admin may view administrative production and monitoring data',()=>{
 assert.equal(canInspectAdminSettings(user('admin')),true);
 for(const role of ['manager','agent','viewer'])
  assert.equal(canInspectAdminSettings(user(role)),false);
});
test('unknown action is never silently authorized',()=>{
 for(const role of ['admin','manager','agent','viewer'])
  assert.equal(canPerformConversationAction(user(role),mine,'enable_production_sending'),false);
});
test('operator must not inherit role via user metadata',()=>{
 const op={user_id:A,active:true,role:'viewer',user_metadata:{role:'admin'}};
 assert.equal(canInspectAdminSettings(op),false);
 assert.equal(canPerformConversationAction(op,mine,'reply'),false);
});
test('conversation access is based on exact assigned user ID',()=>{
 const op=user('agent',A);
 assert.equal(canViewConversation(op,{assigned_to:A+'-another'}),false);
 assert.equal(canViewConversation(op,{assigned_to:''}),false);
 assert.equal(canViewConversation(op,{assigned_to:null}),false);
});
