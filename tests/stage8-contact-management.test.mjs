import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateContact,validateBulkContacts,validateConsentEvidence,allowContactMutation}
 from '../supabase/functions/fsp-connect-staging-api/contact-core.mjs';

test('create permits valid contact but never accepts imported or submitted opt-in',()=>{
 const v=validateContact({wa_id:'919876543210',display_name:'தமிழ் Customer',
  language_code:'ta',tags:['insurance'],opted_in:true});
 assert.equal(v.ok,true);assert.equal(v.data.opted_in,false);
 assert.equal(v.data.source,'manual');
 assert.equal(v.data.wa_id,'919876543210');
});
test('rejects invalid phone, language, tags or invalid contact body',()=>{
 for(const item of [
  {wa_id:'xx',display_name:'Client'},
  {wa_id:'919876543210',language_code:'zh'},
  {wa_id:'919876543210',tags:['bad;tag']},
  {wa_id:'919876543210',tags:Array(13).fill('A')},
  {wa_id:'919876543210',display_name:'<script>'},
  []
 ])assert.equal(validateContact(item).ok,false,JSON.stringify(item));
});
test('contact update may never modify WhatsApp ID or opt-in',()=>{
 const a=validateContact({wa_id:'919000000001',opted_in:true,display_name:'Test'}, {mode:'update'});
 assert.equal(a.ok,true);
 assert.equal('wa_id' in a.data,false);
 assert.equal('opted_in' in a.data,false);
});
test('bulk contacts only inserts distinct numbers, never implicit consent',()=>{
 const v=validateBulkContacts([
  {wa_id:'919876543210',display_name:'A'},
  {wa_id:'919876543210',display_name:'Another'},
  {wa_id:'919999999999',display_name:'B'}]);
 assert.equal(v.ok,true);assert.equal(v.data.length,2);
 assert.equal(v.duplicates_in_file,1);
 assert.ok(v.data.every(row=>row.opted_in===false));
 assert.equal(validateBulkContacts(Array(101).fill({wa_id:'919876543210'})).ok,false);
});
test('consent source and explicit evidence are mandatory, unless action is opt-out',()=>{
 assert.equal(validateConsentEvidence({source:'web_form',proof_ref:'consent form #A1020'}).ok,true);
 assert.equal(validateConsentEvidence({source:'web_form',proof_ref:'tiny'}).ok,false);
 assert.equal(validateConsentEvidence({source:'unknown',proof_ref:'consent form #A1020'}).ok,false);
 assert.equal(validateConsentEvidence({source:'web_form',proof_ref:'<script>bad</script>'}).ok,false);
});
test('viewer, assigned agent and inactive managers cannot import or edit contacts',()=>{
 for(const role of ['viewer','agent'])
  assert.equal(allowContactMutation({role,active:true}),false);
 assert.equal(allowContactMutation({role:'manager',active:false}),false);
 assert.equal(allowContactMutation({role:'admin',active:true}),true);
 assert.equal(allowContactMutation({role:'manager',active:true}),true);
});
const src=readFileSync(new URL('../staging-web/app.js',import.meta.url),'utf8');
const start=src.indexOf('function parseContactCsv(source){');
const end=src.indexOf('async function reloadContacts(){',start);
assert.ok(start>0&&end>start,'CSV parser not found');
const ctx={};vm.createContext(ctx);
vm.runInContext(src.slice(start,end)+'this.parse=parseContactCsv;',ctx);
test('CSV supports comma inside quoted display name and semicolon tags',()=>{
 const rows=ctx.parse('wa_id,display_name,language_code,tags\r\n919876543210,"Ravi, M",ta,"health;renewal"');
 assert.equal(rows.length,1);assert.equal(rows[0].display_name,'Ravi, M');
 assert.equal(rows[0].tags.length,2);
});
test('CSV rejects malformed quote, unknown number or oversized batch',()=>{
 for(const input of [
  'display_name\nJohn',
  'wa_id\nabc',
  'wa_id,display_name\n919876543210,"Broken',
  'wa_id\n'+Array(101).fill('919876543210').join('\n')
 ])assert.throws(()=>ctx.parse(input));
});
