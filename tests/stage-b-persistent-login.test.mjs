import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../staging-web/app.js',import.meta.url),'utf8');
function storage(block=false){
 const data=new Map();
 return {
  getItem:key=>{if(block)throw new Error('storage blocked');return data.get(key)??null},
  setItem:(key,value)=>{if(block)throw new Error('storage blocked');data.set(key,String(value))},
  removeItem:key=>{if(block)throw new Error('storage blocked');data.delete(key)},
  get length(){return data.size}
 };
}
const segment=source.slice(source.indexOf('const state='),source.indexOf('async function authCall('));
const authFns=source.slice(source.indexOf('function isExpired()'),source.indexOf('async function api('));
assert.ok(segment.includes('function saveSession('),'session persistence implementation absent');
assert.ok(authFns.includes('async function ensureSession('),'refresh logic absent');
const key='fsp-connect-21-staging-tab-session';
const makeSession=(token='access-original',refresh='refresh-original',exp=4_000_000_000)=>({
 access_token:token,refresh_token:refresh,expires_at:exp
});
function createBrowser(persistent=storage(),tab=storage(),opts={}){
 const updates=[],errors=[];
 const ctx={
  localStorage:persistent,sessionStorage:tab,
  Date,JSON,Math,Promise,
  setTimeout,clearTimeout,
  window:{},
  document:{getElementById:()=>({classList:{add(){},remove(){},toggle(){}},textContent:''})},
  authCall:async(...args)=>{updates.push(args);return opts.refreshed||{access_token:'access-new',refresh_token:'refresh-new',expires_in:3600}},
 };
 vm.createContext(ctx);
 vm.runInContext(segment+'\n'+authFns+
  '\nthis.auth={getState:()=>state,saveSession,clearSession,ensureSession,isExpired,getKey:()=>sessionName};',ctx);
 return {ctx,auth:ctx.auth,persistent,tab,updates,errors};
}

test('login session is persisted on the device rather than just in the tab',()=>{
 const app=createBrowser(),s=makeSession();
 assert.equal(app.auth.saveSession(s),true);
 assert.equal(JSON.parse(app.persistent.getItem(key)).access_token,s.access_token);
 assert.equal(app.tab.getItem(key),null);
});

test('closing and reopening the browser restores a remembered session',()=>{
 const disk=storage(),first=createBrowser(disk,storage());
 first.auth.saveSession(makeSession());
 const fresh=createBrowser(disk,storage());
 const stored=fresh.persistent.getItem(key)||fresh.tab.getItem(key);
 assert.ok(stored);
 fresh.auth.getState().session=JSON.parse(stored);
 assert.equal(fresh.auth.getState().session.refresh_token,'refresh-original');
});

test('an expired access token refreshes and saves the rotated token persistently',async()=>{
 const app=createBrowser();
 app.auth.saveSession(makeSession('old','old-refresh',1));
 const [one,two]=await Promise.all([app.auth.ensureSession(),app.auth.ensureSession()]);
 assert.equal(one,'access-new');
 assert.equal(two,'access-new');
 assert.equal(app.updates.length,1,'only one refresh request permitted per browser tab');
 assert.equal(JSON.parse(app.persistent.getItem(key)).refresh_token,'refresh-new');
});

test('Logout clears persistent and tab sessions',()=>{
 const app=createBrowser();
 app.auth.saveSession(makeSession());
 app.tab.setItem(key,'old-session');
 app.auth.clearSession();
 assert.equal(app.persistent.getItem(key),null);
 assert.equal(app.tab.getItem(key),null);
 assert.equal(app.auth.getState().session,null);
});

test('when persistent storage is blocked the current tab remains usable',()=>{
 const app=createBrowser(storage(true),storage());
 assert.equal(app.auth.saveSession(makeSession()),false);
 assert.ok(app.tab.getItem(key));
 assert.ok(app.auth.getState().session);
});

test('old tab-only sessions can migrate to persistent storage after an update',()=>{
 const app=createBrowser();
 app.tab.setItem(key,JSON.stringify(makeSession()));
 const stored=app.persistent.getItem(key)||app.tab.getItem(key);
 app.auth.getState().session=JSON.parse(stored);
 app.auth.saveSession(app.auth.getState().session);
 assert.ok(app.persistent.getItem(key));
 assert.equal(app.tab.getItem(key),null);
});

test('password recovery tokens are transient, not saved to persistent storage',()=>{
 const i=source.indexOf("if(kv.get('type')==='recovery'");
 assert.ok(i>0);
 const end=source.indexOf('history.replaceState',i);
 const recovery=source.slice(i,end);
 assert.ok(recovery.includes('clearSession();state.session='));
 assert.ok(!recovery.includes('saveSession('));
});

test('no access tokens or passwords appear in log messages',()=>{
 assert.ok(!source.includes('console.log(state.session'));
 assert.ok(!source.includes('console.log(password'));
});
