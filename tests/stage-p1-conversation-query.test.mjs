import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConversationSearchWhere} from '../supabase/functions/fsp-connect-staging-api/conversation-query.mjs';

test('search looks up name, phone and status across the DB, not only current first page',()=>{
 const p=buildConversationSearchWhere({query:'Customer',filter:'all'});
 assert.equal(p.ok,true);
 const decoded=decodeURIComponent(p.where);
 assert.match(decoded,/contact_name\.ilike\.\*Customer\*/);
 assert.match(decoded,/contact_wa_id\.ilike\.\*Customer\*/);
 assert.match(decoded,/status\.ilike\.\*Customer\*/);
});
test('Tamil with combining vowel sign and numeric WhatsApp phone search accepted',()=>{
 for(const q of ['தமிழ்','மருத்துவம்','+919876543210','முருகன் 123']){
  assert.equal(buildConversationSearchWhere({query:q}).ok,true,q);
 }
});
test('normalizes whitespace, supports unread/open/resolved',()=>{
 assert.match(buildConversationSearchWhere({query:'  Amala  ',filter:'unread'}).where,/unread_count=gt\.0/);
 assert.match(buildConversationSearchWhere({filter:'resolved'}).where,/status=eq\.resolved/);
 assert.match(buildConversationSearchWhere({filter:'open'}).where,/status=eq\.open/);
});
test('reject PostgREST injection characters and regex wildcards',()=>{
 for(const q of ['John,unread_count=gt.0','x)or(status.eq.open','*','%',"Sam' OR 1=1",';', 'A'.repeat(61)]){
  assert.equal(buildConversationSearchWhere({query:q}).ok,false,q);
 }
});
test('reject unsupported filter and invalid query type',()=>{
 assert.equal(buildConversationSearchWhere({filter:'owner'}).ok,false);
 assert.equal(buildConversationSearchWhere({query:42}).ok,false);
});
test('UUID query permits exact authorized-conversation id lookup',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const p=buildConversationSearchWhere({query:id});
 assert.ok(p.ok);
 assert.ok(decodeURIComponent(p.where).includes('id.eq.'+id));
});
test('search values cannot append unescaped query parameters',()=>{
 const p=buildConversationSearchWhere({query:'Tamil Home'});
 assert.ok(p.ok);
 const parts=p.where.split('&').filter(Boolean);
 assert.equal(parts.length,1);
 assert.ok(parts[0].startsWith('or='));
});
