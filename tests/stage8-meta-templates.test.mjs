import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeMetaTemplates,retrieveMetaTemplates}
 from '../supabase/functions/fsp-connect-staging-api/meta-templates.mjs';

const safe={data:[
 {id:'123456789012345',name:'appointment_confirmation',language:'en_US',category:'UTILITY',status:'APPROVED',
  components:[{type:'BODY',text:'Your appointment is confirmed: {{1}}'}]},
 {id:'222222',name:'marketing_offer',language:'ta',category:'MARKETING',status:'PENDING',components:[]}
]};
test('only actual Meta-approved statuses are marked approved',()=>{
 const out=sanitizeMetaTemplates(safe);
 assert.equal(out.templates.length,2);
 assert.equal(out.templates[0].is_meta_approved,true);
 assert.equal(out.templates[1].is_meta_approved,false);
 assert.equal(out.sending_enabled,false);
});
test('unrecognized status is UNKNOWN, never fabricated as approved',()=>{
 const x=sanitizeMetaTemplates({data:[{name:'hello',status:'CUSTOM_APPROVAL',category:'BUSINESS',components:[]}]});
 assert.equal(x.templates[0].status,'UNKNOWN');
 assert.equal(x.templates[0].is_meta_approved,false);
});
test('Meta response redacts other provider fields and limits output',()=>{
 const x=sanitizeMetaTemplates({data:[{...safe.data[0],
  secret:'provider-token-canary',phone:'919999999999',internal_id:'unique-secret'}]});
 const serialized=JSON.stringify(x);
 for(const item of ['provider-token-canary','919999999999','unique-secret'])
  assert.equal(serialized.includes(item),false);
});
test('missing credentials produce no provider request',async()=>{
 let count=0;
 const x=await retrieveMetaTemplates({wabaId:'',token:'',fetcher:()=>{count++;throw Error('must not call')}});
 assert.equal(x.connected,false);assert.equal(count,0);assert.equal(x.sending_enabled,false);
});
test('provider lookup is GET-only and never sends WhatsApp messages',async()=>{
 let request=null;
 const x=await retrieveMetaTemplates({wabaId:'922433197569331',token:'A'.repeat(40),
  fetcher:async(url,options)=>{
   request={url,options};
   return {ok:true,json:async()=>safe};
  }});
 assert.equal(x.connected,true);
 assert.equal(request.options.method,'GET');
 assert.ok(request.url.endsWith('/message_templates?fields=id%2Cname%2Clanguage%2Ccategory%2Cstatus%2Ccomponents&limit=100'));
 assert.ok(!JSON.stringify(x).includes('A'.repeat(40)));
});
test('Meta access failure is shown as unavailable, not zero approved',async()=>{
 const x=await retrieveMetaTemplates({wabaId:'922433197569331',token:'A'.repeat(40),
  fetcher:async()=>({ok:false,status:403})});
 assert.equal(x.connected,false);assert.match(x.error,/403/);
 assert.equal(x.sending_enabled,false);
});
