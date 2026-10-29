import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../staging-web/app.js', import.meta.url), 'utf8');
const start = source.indexOf('async function openConversation(id){');
const end = source.indexOf('\n/**\n * Manual Stage B2 test reply.', start);
assert.ok(start > 0 && end > start, 'Open conversation implementation must remain testable');
const implementation = source.slice(start, end);
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function node(){
  return {textContent:'',innerHTML:'',children:[],scrollTop:0,scrollHeight:20,replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);},append(){},className:''};
}
function fixture({unread=2,role='admin',markResult=true,onFetch=null}={}){
  const nodes=new Map();
  const $=(name)=>{if(!nodes.has(name))nodes.set(name,node());return nodes.get(name)};
  const state={chosen:null,page:'Inbox',operator:{role},details:null,messages:[],convs:[{id,unread_count:unread}]};
  const calls=[], UI={renderContext:0,renderList:0,renderComposer:0,toasts:[]};
  const conversation={id,unread_count:unread,contact:{wa_id:'919999888777'},status:'open',last_message_at:'2026-10-29T13:55:00Z'};
  const context={
    state,$,document:{createElement:node},
    renderConversationList:()=>{UI.renderList++},
    renderContext:()=>{UI.renderContext++},
    renderReplyComposer:()=>{UI.renderComposer++},
    date:()=>'19:25',toast:(message)=>UI.toasts.push(message),
    api:async(path,method='GET',body)=>{
      calls.push({path,method,body});
      if(onFetch)onFetch({path,state});
      if(path==='/api/conversations/'+id)return {data:{...conversation}};
      if(path.endsWith('/messages?limit=100'))return {data:[{direction:'inbound',body:'Hi FSP Connect Test',provider_status:'received',created_at:'2026-10-29T13:55:00Z',message_type:'text'}]};
      if(method==='POST')return {ok:true,marked_read:markResult};
      throw new Error('Unexpected endpoint '+path);
    }
  };
  vm.runInNewContext(implementation+'\nthis.testOpen=openConversation;',context,{timeout:1000});
  return {open:context.testOpen,state,calls,UI,nodes};
}

test('opening an unread conversation clears local badges only after guarded server ack',async()=>{
  const f=fixture();
  await f.open(id);
  const posts=f.calls.filter(x=>x.method==='POST');
  assert.equal(posts.length,1);
  assert.equal(posts[0].body.action,'auto_mark_read');
  assert.equal(posts[0].body.observed_last_message_at,'2026-10-29T13:55:00Z');
  assert.equal(posts[0].body.observed_unread_count,2);
  assert.equal(f.state.details.unread_count,0);
  assert.equal(f.state.convs[0].unread_count,0);
  assert.equal(f.UI.renderComposer,1);
  assert.equal(f.UI.toasts.length,0);
});

test('opening already read conversation never sends another write',async()=>{
  const f=fixture({unread:0});
  await f.open(id);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
  assert.equal(f.state.convs[0].unread_count,0);
});

test('viewer retains read-only behavior and does not mark unread',async()=>{
  const f=fixture({role:'viewer'});
  await f.open(id);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
  assert.equal(f.state.convs[0].unread_count,2);
});

test('stale snapshot acknowledgement does not hide new unread messages',async()=>{
  const f=fixture({markResult:false});
  await f.open(id);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,1);
  assert.equal(f.state.convs[0].unread_count,2);
  assert.equal(f.state.details.unread_count,2);
});

test('switching conversations while opening never clears the previous one',async()=>{
  let switched=false;
  const f=fixture({onFetch:({path,state})=>{if(!switched && path.startsWith('/api/conversations/')){switched=true;state.chosen=otherId;}}});
  await f.open(id);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
  assert.equal(f.state.convs[0].unread_count,2);
});

test('switching away from Inbox while opening never marks a conversation',async()=>{
  let switched=false;
  const f=fixture({onFetch:({path,state})=>{if(!switched && path.startsWith('/api/conversations/')){switched=true;state.page='Settings';}}});
  await f.open(id);
  assert.equal(f.calls.filter(x=>x.method==='POST').length,0);
});
