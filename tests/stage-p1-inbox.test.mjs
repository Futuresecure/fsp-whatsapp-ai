import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../staging-web/app.js',import.meta.url),'utf8');
const select=(start,end)=>{
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0 && b>a,'Expected function not found: '+start);
 return source.slice(a,b);
};
const nameSearch=select('function titleFor(c){','function renderConversationList(){');
function fixtureSearch(){
 const ctx={state:{details:null},$:(id)=>null};
 vm.createContext(ctx);vm.runInContext(nameSearch+'this.match=conversationMatches;',ctx);
 return ctx.match;
}
test('case-insensitive name and mobile search work across authorized conversation rows',()=>{
 const match=fixtureSearch();
 const c={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'open',unread_count:2,contact_name:'Tamil Customer',contact_wa_id:'919988776655'};
 assert.ok(match(c,'tamil','all'));
 assert.ok(match(c,'988776','all'));
 assert.ok(match(c,'open','all'));
 assert.ok(!match(c,'nomatch','all'));
});
test('unread / open / resolved filters do not leak unrelated conversations',()=>{
 const match=fixtureSearch();
 const c={id:'x',status:'open',unread_count:0,contact_name:'Client',contact_wa_id:'91'};
 assert.ok(match(c,'','open'));
 assert.ok(!match(c,'','resolved'));
 assert.ok(!match(c,'','unread'));
 assert.ok(match({...c,unread_count:1},'','unread'));
});

const poll=select('async function refreshInboxQuietly(){','async function openConversation(id){');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixturePoll({newMessage=true,unread=1,hidden=false}={}){
 const contact={id,status:'open',unread_count:unread,last_message_at:'2026-10-30T04:00:00Z'};
 const previous={...contact,unread_count:0};
 const oldMessages=[{id:'old',body:'Earlier',direction:'inbound',provider_status:'received'}];
 const nextMessages=newMessage?[...oldMessages,{id:'new',body:'New enquiry',direction:'inbound',provider_status:'received'}]:oldMessages;
 const counts={render:0,paint:0,toast:[],posts:[],note:'Draft still here'};
 const els={
  inboxSync:{textContent:''},
  noteText:{value:counts.note}
 };
 const ctx={
  inboxRefreshBusy:false,
  state:{page:'Inbox',operator:{role:'admin'},convs:[previous],chosen:id,details:{...previous},messages:oldMessages,inboxRequestVersion:1,inboxTotal:1},
  document:{visibilityState:hidden?'hidden':'visible'},
  $:key=>els[key]||null,
  getInboxPath:()=>'/api/conversations?limit=50',
  renderConversationList:()=>counts.render++,
  renderContext:()=>{},
  paintChatHistory:()=>counts.paint++,
  messageSignature:messages=>messages.map(x=>[x.id,x.provider_status,x.body].join(':')).join('|'),
  date:()=> '10:00',
  toast:s=>counts.toast.push(s),
  api:async(path,method='GET',body)=>{
   if(method==='POST'){counts.posts.push(body);return {marked_read:true};}
   if(path==='/api/conversations?limit=50')return {data:[contact],total:1,has_more:false};
   if(path==='/api/conversations/'+id)return {data:{...contact}};
   if(path.endsWith('/messages?limit=100'))return {data:[...nextMessages].reverse()};
   throw new Error('Unexpected API: '+path);
  }
 };
 vm.createContext(ctx);vm.runInContext(poll+'this.poll=refreshInboxQuietly;',ctx);
 return {ctx,counts};
}
test('poll updates new messages, preserves draft and marks viewed unread snapshot',async()=>{
 const {ctx,counts}=fixturePoll();
 await ctx.poll();
 assert.equal(counts.paint,1);
 assert.equal(counts.posts.length,1);
 assert.equal(counts.posts[0].action,'auto_mark_read');
 assert.equal(ctx.state.convs[0].unread_count,0);
 assert.equal(counts.note,'Draft still here');
 assert.equal(ctx.inboxRefreshBusy,false);
});
test('poll skips hidden tabs and cannot mutate list without a page being open',async()=>{
 const {ctx,counts}=fixturePoll({hidden:true});
 await ctx.poll();
 assert.equal(counts.render,0);
 assert.equal(counts.posts.length,0);
});
test('poll without new messages preserves history renderer state',async()=>{
 const {ctx,counts}=fixturePoll({newMessage:false,unread:0});
 await ctx.poll();
 assert.equal(counts.paint,0);
 assert.equal(counts.posts.length,0);
});
