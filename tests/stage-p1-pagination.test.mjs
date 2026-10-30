import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../staging-web/app.js',import.meta.url),'utf8');
const begin=source.indexOf('function getInboxPath(offset=0){');
const end=source.indexOf('function renderConversationList(){',begin);
assert.ok(begin>0 && end>begin,'Pagination implementation missing');
const impl=source.slice(begin,end);
function fixture({query='',filter='all',existing=[],total=4}={}){
 const state={
  page:'Inbox',inboxQuery:query,inboxFilter:filter,inboxRequestVersion:0,
  inboxTotal:null,inboxHasMore:true,convs:[...existing]
 };
 const requests=[],toast=[],render=[];
 let resolveApi=null;
 const ctx={
  state,URLSearchParams,Math,Number,Set,
  INBOX_PAGE_SIZE:2,inboxLoadMoreBusy:false,
  $:()=>null,
  toast:x=>toast.push(x),
  renderConversationList:()=>render.push(state.convs.map(x=>x.id)),
  api:async route=>{
   requests.push(route);
   return {data:requests.length===1?[{id:'a'},{id:'b'}]:[{id:'c'},{id:'d'}],
    total,has_more:requests.length===1};
  }
 };
 vm.createContext(ctx);
 vm.runInContext(impl+'\nthis.load=loadInboxPage;this.path=getInboxPath;',ctx);
 return {ctx,state,requests,toast,render};
}
test('query is URL-encoded, filters and offset passed to server safely',()=>{
 const f=fixture({query:'குமார் Raj +91998',filter:'unread'});
 const u=new URL('https://example.test'+f.ctx.path(100));
 assert.equal(u.searchParams.get('q'),'குமார் Raj +91998');
 assert.equal(u.searchParams.get('filter'),'unread');
 assert.equal(u.searchParams.get('offset'),'100');
 assert.equal(u.searchParams.get('limit'),'2');
});
test('load first page, then next page without duplicating conversations',async()=>{
 const f=fixture();
 await f.ctx.load(true);
 assert.equal(f.state.convs.length,2);
 assert.equal(f.state.inboxHasMore,true);
 await f.ctx.load(false);
 assert.equal(f.state.convs.length,4);
 assert.equal(f.state.inboxHasMore,false);
 assert.ok(f.requests[1].includes('offset=2'));
});
test('loading beyond the final page makes no extra API calls',async()=>{
 const f=fixture();
 await f.ctx.load(true);
 await f.ctx.load(false);
 await f.ctx.load(false);
 assert.equal(f.requests.length,2);
});
test('navigation away discards stale results from in-flight search',async()=>{
 const f=fixture();
 let release;
 f.ctx.api=()=>new Promise(resolve=>{release=resolve});
 const pending=f.ctx.load(true);
 f.state.page='Settings';
 f.state.inboxRequestVersion++;
 release({data:[{id:'unwanted'}],total:1,has_more:false});
 await pending;
 assert.equal(f.state.convs.length,0);
});
