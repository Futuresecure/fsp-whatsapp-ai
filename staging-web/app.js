'use strict';
// Staging-only frontend. Public key may be embedded; privileged Supabase keys MUST NOT be embedded.
const CONFIG = Object.freeze({
  supabaseUrl:'https://vzcpzhobtfwhurcsppdl.supabase.co',
  publishableKey:'sb_publishable_Yk_nQ240q75Sf7AZH5K_wQ_xpuwUymV',
  api:'https://vzcpzhobtfwhurcsppdl.supabase.co/functions/v1/fsp-connect-staging-api',
});
const NAV = [
  ['Overview','▦'],['Inbox','▤'],['AI Assistant','✦'],['Automation Studio','⚙'],
  ['Templates','▧'],['Broadcast','◈'],['Contacts','♙'],['Analytics','▥'],['Settings','☷'],
];
const $=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'—';
const roleTag=r=>(r||'viewer').toUpperCase();
const state={session:null,operator:null,page:'Overview',summary:null,convs:[],contacts:[],messages:[],chosen:null,details:null,operators:[],loading:false,offset:0,inboxQuery:'',inboxFilter:'all',inboxTotal:null,inboxHasMore:false,inboxRequestVersion:0};
const sessionName='fsp-connect-21-staging-tab-session';
let refreshPending=null;
let sessionEpoch=0;
const testReplyAttempted=new Set(); // one reply attempt per conversation per page session
let inboxRefreshTimer=null;
let inboxRefreshBusy=false;
let inboxLoadMoreBusy=false;
let inboxSearchTimer=null;
const INBOX_PAGE_SIZE=50;
const INBOX_POLL_INTERVAL_MS=15000;
function stopInboxAutoRefresh(){
 if(inboxRefreshTimer!==null){clearInterval(inboxRefreshTimer);inboxRefreshTimer=null;}
}
function startInboxAutoRefresh(){
 stopInboxAutoRefresh();
 inboxRefreshTimer=setInterval(()=>{void refreshInboxQuietly()},INBOX_POLL_INTERVAL_MS);
}
function notice(text,secure=false){return `<div class="notice ${secure?'secure':''}">${h(text)}</div>`}
let toastTimer;
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hide');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hide'),4000)}
function showAuth(message=''){$('appScreen').classList.add('hide');$('loginScreen').classList.remove('hide');$('loginError').textContent=message;$('loginError').classList.toggle('hide',!message)}
function showApp(){$('loginScreen').classList.add('hide');$('appScreen').classList.remove('hide');$('avatar').textContent=(state.operator?.name||'FSP').slice(0,2).toUpperCase()}
function clearSession(){sessionEpoch++;state.session=null;state.operator=null;state.summary=null;state.convs=[];state.contacts=[];state.chosen=null;state.messages=[];try{sessionStorage.removeItem(sessionName)}catch{}try{localStorage.removeItem(sessionName)}catch{}}
function saveSession(s){
 state.session=s;
 try{
  localStorage.setItem(sessionName,JSON.stringify(s));
  try{sessionStorage.removeItem(sessionName)}catch{}
  return true;
 }catch{
  // Browser storage may be disabled; fall back to the current tab.
  try{sessionStorage.setItem(sessionName,JSON.stringify(s))}catch{}
  return false;
 }
}
async function authCall(path,method,body,bearer){
 const headers={'apikey':CONFIG.publishableKey,'content-type':'application/json'};
 if(bearer)headers.authorization='Bearer '+bearer;
 const r=await fetch(CONFIG.supabaseUrl+'/auth/v1/'+path,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store'});
 let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data.msg||data.error_description||data.message||data.error||'Authentication failed');
 return data;
}
function isExpired(){return !state.session || Date.now()>=Number(state.session.expires_at||0)*1000-30000}
async function ensureSession(){
 if(!state.session)throw new Error('Sign in required');
 if(isExpired()){
  if(!state.session.refresh_token)throw new Error('Session expired');
  if(!refreshPending){
   const epoch=sessionEpoch;
   refreshPending=(async()=>{
    const s=await authCall('token?grant_type=refresh_token','POST',{refresh_token:state.session.refresh_token});
    if(sessionEpoch!==epoch||!state.session)throw new Error('Sign in required');
    saveSession({...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)});
   })().finally(()=>{refreshPending=null});
  }
  await refreshPending;
 }
 return state.session.access_token;
}
async function api(path,method='GET',body){
 const bearer=await ensureSession();
 const r=await fetch(CONFIG.api+'?route='+encodeURIComponent(path),{method,headers:{'authorization':'Bearer '+bearer,'apikey':CONFIG.publishableKey,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 let result={};try{result=await r.json()}catch{}
 if(r.status===401){clearSession();showAuth('Your session has expired. Please sign in again.');throw new Error('Session expired')}
 if(r.status===403)throw new Error('Your account is not authorised for this action');
 if(!r.ok)throw new Error(result.error||`Request failed (${r.status})`);
 return result;
}
async function login(email,password){
 const s=await authCall('token?grant_type=password','POST',{email,password});
 state.session={...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)};
 try{
  const op=await api('/api/me'); // verify active, authorized operator BEFORE persisting
  state.operator=op;
  const persisted=saveSession(state.session);
  showApp();
  await navigate('Overview');
  if(!persisted)toast('Your browser blocks persistent storage. Login may be required after closing.');
 }catch(e){
  clearSession();
  showAuth(e.message==='Your account is not authorised for this action'?
    'Login succeeded but your operator account is not active. Ask the administrator to assign a role.':e.message);
 }
}
async function signOut(){
 stopInboxAutoRefresh();
 const current=state.session;
 clearSession();showAuth();
 if(current?.access_token){try{await authCall('logout','POST',null,current.access_token)}catch{}}
}
function nav(){const node=$('nav');node.replaceChildren();NAV.forEach(([name,ico])=>{
 const b=document.createElement('button');b.type='button';b.className='navbtn'+(state.page===name?' active':'');b.setAttribute('aria-current',state.page===name?'page':'false');
 const icon=document.createElement('span');icon.className='navicon';icon.textContent=ico;
 const label=document.createElement('span');label.className='navlabel';label.textContent=name;
 b.append(icon,label);b.onclick=()=>navigate(name);node.appendChild(b);
})}
function header(name,desc,button='Refresh'){return `<div class="pagehead"><div><h1>${h(name)}</h1><p>${h(desc)}</p></div><div class="btnrow"><button type="button" class="btn" id="refreshBtn">⟳ ${h(button)}</button></div></div>`}
function content(html){$('mainContent').innerHTML=html;const b=$('refreshBtn');if(b)b.onclick=()=>navigate(state.page,true)}
async function navigate(name,force=false){
 if(!state.operator)return;
 stopInboxAutoRefresh();
 if(inboxSearchTimer!==null){clearTimeout(inboxSearchTimer);inboxSearchTimer=null}
 ++state.inboxRequestVersion;
 state.page=name;nav();
 if(name==='Overview'){
  content(header(name,'Actual FSP Connect database activity · no fictional data')+'<div class="loading">Loading real data…</div>');
  try{state.summary=await api('/api/dashboard');renderOverview(name)}catch(e){renderError(e)}
 }else if(name==='Analytics'){
  content(header('Analytics','Privacy-safe message statistics')+'<div class="loading">Loading activity…</div>');
  try{
   const report=await api('/api/analytics?days='+analyticsDays);
   if(state.page==='Analytics')renderAnalytics(report);
  }catch(e){if(state.page==='Analytics')renderError(e)}
 }else if(name==='Inbox'){
  content(header(name,'Live database conversations · manual test replies restricted')+'<div class="loading">Loading authorized conversations…</div>');
  try{
   const result=await api(getInboxPath(0));
   if(state.page!=='Inbox')return;
   state.convs=result.data||[];
   state.inboxTotal=Number.isFinite(result.total)?result.total:null;
   state.inboxHasMore=result.has_more===true;
   await renderInbox();
  }catch(e){if(state.page==='Inbox')renderError(e)}
 }else if(name==='Templates'){
  content(header('Templates','Provider-verified read-only Meta template inventory')+'<div class="loading">Checking Meta-approved templates…</div>');
  try{const result=await api('/api/templates');if(state.page==='Templates')renderTemplates(result)}
  catch(e){if(state.page==='Templates')renderError(e)}
 }else if(name==='Contacts'){
  content(header(name,'Contacts visible to your operator role')+'<div class="loading">Loading contacts…</div>');
  try{state.contacts=(await api('/api/contacts?limit=100')).data||[];state.contactsHasMore=state.contacts.length===100;renderContacts()}catch(e){renderError(e)}
 }else if(name==='Settings')renderSettings();
 else renderPlanned(name);
}
function renderError(e){content(header(state.page,'Staging connection state')+notice(`Unable to load data: ${e.message}`))}
function stat(label,value,sub){return `<div class="card stat"><div class="eyebrow">${h(label)}</div><div class="num">${value===null?'—':Number(value||0).toLocaleString('en-IN')}</div><div class="trend">${h(sub)}</div></div>`}
function renderOverview(name){const s=state.summary||{};
 const scope=s.scope==='assigned'?'Only conversations assigned to you':'Workspace-wide activity';
 content(header(name,name==='Analytics'?'Verified database counts, not campaign-delivery estimates':'Your FSP Connect staging workspace')+
 notice('STAGING MODE — Meta inbound webhook and restricted manual test replies have passed real WhatsApp tests. Customer-wide sending, AI automation, templates and broadcast remain disabled.')+
 `<div class="statgrid">${stat('Conversations',s.conversations,scope)}${stat('Unread conversations',s.unread_conversations,'From Inbox database')}${stat('Contacts',s.contacts,s.contacts===null?'Available to Admin / Manager':'Stored customer contacts')}${stat('Message records',s.messages,s.messages===null?'Available to Admin / Manager':'Provider-backed records')}</div>`+
 `<div class="twocol"><section class="card modulebox"><h2>Communication workspace</h2><p>Read authorised conversations, inspect message history and manage internal operator actions. Manual test replies are restricted to the allowlisted number.</p><button id="openInbox" class="primary">Open Inbox</button></section><section class="card modulebox"><h2>Safety controls</h2><div class="inforow"><span>WhatsApp outgoing</span><b class="pill amber">Test allowlist only</b></div><div class="inforow"><span>AI Auto Reply</span><b class="pill amber">OFF</b></div><div class="inforow"><span>Broadcast / Automation</span><b class="pill amber">OFF</b></div></section></div>`);
 $('openInbox').onclick=()=>navigate('Inbox');
}

let analyticsDays=30;
function renderAnalytics(report){
 if(!report?.ok){renderError(new Error(report?.error||'Analytics unavailable'));return}
 const t=report.totals||{};
 const rows=report.daily||[];
 const max=Math.max(1,...rows.map(x=>x.messages));
 const bars=rows.map(x=>'<div style="min-width:20px;flex:1;text-align:center" title="'+
  h(x.day+': '+x.messages+' messages')+'"><div style="height:110px;display:flex;align-items:flex-end;justify-content:center">'+
  '<div style="height:'+Math.max(2,Math.round(x.messages/max*100))+'px;background:#285bb6;width:12px;border-radius:3px 3px 0 0"></div>'+
  '</div><small style="font-size:9px">'+h(x.day.slice(5))+'</small></div>').join('');
 const tableRows=rows.map(x=>'<tr><td>'+h(x.day)+'</td><td>'+x.messages+
  '</td><td>'+x.inbound+'</td><td>'+x.outbound+'</td></tr>').join('');
 const html=header('Analytics','Actual WhatsApp message outcomes · UTC daily dates')+
  notice('Status counts are current outcomes (sent/delivered/read/failed), not cumulative funnel totals. All results use current operator permissions.')+
  '<section class="card"><div class="btnrow"><label for="analyticsDays">Reporting period</label>'+
  '<select class="input" id="analyticsDays"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select>'+
  '<button class="btn" id="analyticsExport" type="button">Export Daily CSV</button></div></section>'+
  '<div class="statgrid">'+stat('Conversations',t.conversations,report.scope+' scope')+
  stat('Contacts',t.contacts,'Authorized conversations')+
  stat('Messages',t.messages,analyticsDays+' days')+
  stat('Incoming',t.inbound,'From customer')+
  stat('Outgoing',t.outbound,'From business')+
  stat('Current Sent',t.sent,'Not yet marked delivered/read')+
  stat('Current Delivered',t.delivered,'Not yet marked read')+
  stat('Current Read',t.read,'Latest provider status')+
  stat('Current Failed',t.failed,'Requires provider review')+'</div>'+
  '<section class="card"><h2>Daily Message Activity</h2><div style="overflow-x:auto"><div style="display:flex;gap:5px;min-width:'+Math.max(500,rows.length*22)+'px">'+bars+'</div></div></section>'+
  '<section class="card"><h2>Daily Counts</h2><div style="overflow:auto;max-height:360px"><table class="data-table"><thead><tr><th>UTC Date</th><th>Total</th><th>Inbound</th><th>Outbound</th></tr></thead><tbody>'+
  tableRows+'</tbody></table></div></section>';
 content(html);
 $('analyticsDays').value=String(analyticsDays);
 $('analyticsDays').onchange=()=>{analyticsDays=Number($('analyticsDays').value);void navigate('Analytics',true)};
 $('analyticsExport').onclick=()=>{
  const csv=['day,messages,inbound,outbound',...rows.map(x=>[x.day,x.messages,x.inbound,x.outbound].join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='fsp-connect-daily-analytics-'+analyticsDays+'d.csv';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
}

function renderTemplates(payload){
 const templates=payload?.templates||[];
 const statuses=['APPROVED','PENDING','REJECTED','PAUSED','DISABLED','UNKNOWN'];
 const statusCounts=Object.fromEntries(statuses.map(s=>[s,templates.filter(t=>t.status===s).length]));
 const rows=templates.map(t=>'<tr><td>'+h(t.name)+'</td><td>'+h(t.language)+'</td><td>'+h(t.category)+
  '</td><td>'+h(t.status)+'</td><td>'+h(t.body_preview||'—')+'</td></tr>').join('');
 content(header('Templates','Meta WhatsApp Business Account · Read-only provider status')+
  notice('Only Meta can approve templates. No template send, create, edit or delete is enabled through this staging page.')+
  '<section class="card"><h2>Meta Connection</h2><p>'+
  (payload?.connected?'Provider inventory accessible.':'Provider lookup not available: '+h(payload?.error||'No WABA configuration'))+
  '</p><p>Approved: '+statusCounts.APPROVED+' · Pending: '+statusCounts.PENDING+
  ' · Rejected: '+statusCounts.REJECTED+' · Paused: '+statusCounts.PAUSED+'</p>'+
  (payload?.truncated?'<p class="muted">More than 100 templates may exist; this view shows the first 100.</p>':'')+'</section>'+
  '<section class="card"><h2>Existing Provider Templates</h2>'+
  (templates.length?'<div style="overflow:auto"><table class="data-table"><thead><tr><th>Template</th><th>Language</th><th>Category</th><th>Meta Status</th><th>Body Preview</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
    '<div class="empty">No templates returned by Meta. Check access credentials or create/approve templates in Meta Business Manager.</div>')+
  '</section>');
}
function titleFor(c){
 const d=state.details?.id===c.id?state.details.contact:null;
 return c.contact_name||d?.display_name||d?.profile_name||c.contact_wa_id||'Conversation '+c.id.slice(0,8);
}
function conversationMatches(c,q,filter){
 if(filter==='unread'&&!(Number(c.unread_count)>0))return false;
 if(filter==='open'&&c.status!=='open')return false;
 if(filter==='resolved'&&c.status!=='resolved')return false;
 if(!q)return true;
 return [c.id,c.status,titleFor(c),c.contact_wa_id].some(v=>String(v||'').toLowerCase().includes(q));
}
function getInboxPath(offset=0){
 const params=new URLSearchParams({
  limit:String(INBOX_PAGE_SIZE),
  offset:String(Math.max(0,offset)),
  filter:state.inboxFilter
 });
 if(state.inboxQuery.trim())params.set('q',state.inboxQuery.trim());
 return '/api/conversations?'+params.toString();
}
async function loadInboxPage(reset=true){
 if(state.page!=='Inbox')return;
 if(!reset && (!state.inboxHasMore||inboxLoadMoreBusy))return;
 const version=reset?++state.inboxRequestVersion:state.inboxRequestVersion;
 const offset=reset?0:state.convs.length;
 if(!reset)inboxLoadMoreBusy=true;
 try{
  const result=await api(getInboxPath(offset));
  if(state.page!=='Inbox'||version!==state.inboxRequestVersion)return;
  const rows=result.data||[];
  if(reset)state.convs=rows;
  else{
   const ids=new Set(state.convs.map(c=>c.id));
   state.convs=[...state.convs,...rows.filter(c=>!ids.has(c.id))];
  }
  state.inboxTotal=Number.isFinite(result.total)?result.total:null;
  state.inboxHasMore=result.has_more===true;
  renderConversationList();
 }catch(e){
  if(state.page==='Inbox'&&version===state.inboxRequestVersion)
   toast('Inbox search: '+String(e.message||'Unable to load'));
 }finally{
  if(!reset)inboxLoadMoreBusy=false;
  const btn=$('convLoadMore');
  if(btn)btn.disabled=inboxLoadMoreBusy;
 }
}
function renderConversationList(){const node=$('conversationList');if(!node)return;
 node.replaceChildren();
 const q=($('convSearch')?.value||'').trim().toLowerCase();
 const filter=$('convFilter')?.value||'all';
 const items=state.convs.filter(c=>conversationMatches(c,q,filter));
 const count=$('convCount');
 if(count)count.textContent='Loaded '+items.length+(state.inboxTotal===null?'':' / '+state.inboxTotal);
 const more=$('convLoadMore');
 if(more){more.classList.toggle('hide',!state.inboxHasMore);more.disabled=inboxLoadMoreBusy;}
 if(!items.length){node.innerHTML='<div class="empty">No matching conversations.</div>';return}
 items.forEach(c=>{
  const b=document.createElement('button');b.type='button';
  b.className='conv'+(state.chosen===c.id?' active':'')+(Number(c.unread_count)>0?' unread':'');
  b.setAttribute('aria-label',titleFor(c)+(c.unread_count?' · '+c.unread_count+' unread':''));
  const top=document.createElement('div');top.className='convtop';
  const title=document.createElement('b');title.textContent=titleFor(c);
  const time=document.createElement('small');time.textContent=date(c.last_message_at);
  top.append(title,time);
  const status=document.createElement('p');status.textContent='Status: '+c.status+(c.contact_wa_id?' · +'+c.contact_wa_id:'');
  const bot=document.createElement('div');bot.className='btnrow';
  const pill=document.createElement('span');pill.className='pill '+(c.unread_count?'blue':'');
  pill.textContent=c.unread_count?c.unread_count+' unread':'No unread';
  bot.appendChild(pill);b.append(top,status,bot);b.onclick=()=>openConversation(c.id);node.appendChild(b);
 });
}
async function renderInbox(){content(header('Inbox','Incoming WhatsApp messages · auto refresh every 15 seconds')+
 '<div class="inbox"><section class="convcol"><div class="colhead"><div class="btnrow" style="align-items:center;justify-content:space-between"><h2>Conversations</h2><small class="muted" id="convCount"></small></div><input class="input" id="convSearch" aria-label="Search contacts by name, phone or conversation" placeholder="Search name, mobile, status…" style="margin-top:12px" /><select class="input" id="convFilter" aria-label="Filter conversations" style="margin-top:8px"><option value="all">All conversations</option><option value="unread">Unread only</option><option value="open">Open</option><option value="resolved">Resolved</option></select><div class="muted tiny" id="inboxSync" aria-live="polite" style="margin-top:8px">Auto-refresh: every 15 seconds</div></div><div id="conversationList" class="convlist"></div><button type="button" class="btn" id="convLoadMore" style="margin:8px 12px">Load more conversations</button></section><section class="chatcol"><div class="chathead"><div><b id="chatTitle">Select a conversation</b><div class="muted tiny" id="chatDesc">Private message history</div></div><div class="btnrow"><span class="pill amber">Test replies only</span><button type="button" class="btn" id="detailsBtn">Details</button></div></div><div class="chatbody" id="chatBody"><div class="empty">Select a conversation to view real messages.</div></div><div class="composer" id="replyComposer"><div class="disabledsend">Select an authorized test conversation to reply. Test-recipient allowlist and 24-hour reply window are enforced.</div></div></section><section class="contextcol"><div class="colhead"><h2>Conversation details</h2></div><div class="contextbody" id="contextBody"><p class="muted tiny">Select a conversation.</p></div></section></div>');
 $('convSearch').value=state.inboxQuery;
 $('convFilter').value=state.inboxFilter;
 $('convSearch').oninput=()=>{
  state.inboxQuery=$('convSearch').value;
  ++state.inboxRequestVersion; // cancel pending older searches
  if(inboxSearchTimer!==null)clearTimeout(inboxSearchTimer);
  inboxSearchTimer=setTimeout(()=>{void loadInboxPage(true)},300);
 };
 $('convFilter').onchange=()=>{
  state.inboxFilter=$('convFilter').value;
  if(inboxSearchTimer!==null)clearTimeout(inboxSearchTimer);
  void loadInboxPage(true);
 };
 $('convLoadMore').onclick=()=>{void loadInboxPage(false)};
 $('detailsBtn').onclick=()=>document.querySelector('.contextcol')?.classList.toggle('open');
 renderConversationList();
 if(state.chosen&&state.convs.some(c=>c.id===state.chosen))await openConversation(state.chosen);
 if(state.page==='Inbox')startInboxAutoRefresh();
}
function paintChatHistory(scrollToEnd=false){
 const box=$('chatBody');if(!box)return;
 const wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<100;
 const oldScroll=box.scrollTop;
 box.replaceChildren();
 if(!state.messages.length)box.innerHTML='<div class="empty">No messages recorded for this conversation.</div>';
 for(const msg of state.messages){
  const el=document.createElement('div');el.className='msg'+(msg.direction==='outbound'?' out':'');
  const b=document.createElement('div');b.className='bubble';
  b.textContent=msg.body??('['+msg.message_type+' message]');
  const small=document.createElement('div');small.className='msgmeta';
  small.textContent=msg.direction+' · '+msg.provider_status+' · '+date(msg.provider_timestamp||msg.created_at);
  el.append(b,small);box.appendChild(el);
 }
 if(scrollToEnd||wasNearBottom)box.scrollTop=box.scrollHeight;
 else box.scrollTop=oldScroll;
}
function messageSignature(messages){
 return messages.map(m=>[m.id,m.provider_status,m.body].join(':')).join('|');
}
async function refreshInboxQuietly(){
 if(inboxRefreshBusy || state.page!=='Inbox' || !state.operator || document.visibilityState==='hidden')return;
 inboxRefreshBusy=true;
 const version=state.inboxRequestVersion;
 try{
  const previous=state.convs;
  const response=await api(getInboxPath(0));
  if(state.page!=='Inbox'||version!==state.inboxRequestVersion)return;
  const latest=response.data||[];
  const newUnread=latest.some(c=>{
   const old=previous.find(x=>x.id===c.id);
   return Number(c.unread_count)>Number(old?.unread_count||0);
  });
  // Refresh the newest page, preserving older explicitly loaded pages.
  const seen=new Set(latest.map(x=>x.id));
  state.convs=[...latest,...previous.filter(c=>!seen.has(c.id))];
  state.inboxTotal=Number.isFinite(response.total)?response.total:state.inboxTotal;
  state.inboxHasMore=state.inboxTotal===null?response.has_more===true:state.convs.length<state.inboxTotal;
  renderConversationList();
  const sync=$('inboxSync');
  if(sync)sync.textContent='Auto-refresh on · Last checked '+date(new Date().toISOString());
  const id=state.chosen;
  if(!id||!state.convs.some(c=>c.id===id)){
   if(newUnread)toast('New unread WhatsApp conversation');
   return;
  }
  const before=messageSignature(state.messages);
  const [d,m]=await Promise.all([
   api('/api/conversations/'+id),
   api('/api/conversations/'+id+'/messages?limit=100')
  ]);
  if(state.page!=='Inbox'||state.chosen!==id||version!==state.inboxRequestVersion)return;
  const rows=(m.data||[]).reverse();
  const oldIds=new Set(state.messages.filter(x=>x.direction==='inbound').map(x=>x.id));
  const incoming=rows.some(x=>x.direction==='inbound'&&!oldIds.has(x.id));
  if(messageSignature(rows)!==before){
   state.messages=rows;
   paintChatHistory(false); // do not touch a draft in the reply composer
  }
  const previousDetail=state.details;
  state.details=d.data;
  const note=$('noteText')?.value;
  if(!previousDetail||previousDetail.status!==d.data.status||
    previousDetail.unread_count!==d.data.unread_count){
   renderContext();
   if(note && $('noteText'))$('noteText').value=note;
  }
  if(incoming)toast('New WhatsApp message received');
  if(Number(d.data.unread_count)>0 && state.operator.role!=='viewer'){
   const ack=await api('/api/conversations/'+id+'/actions','POST',{
    action:'auto_mark_read',
    observed_last_message_at:d.data.last_message_at,
    observed_unread_count:d.data.unread_count
   });
   if(state.page==='Inbox' && state.chosen===id && ack.marked_read){
    state.details.unread_count=0;
    const item=state.convs.find(c=>c.id===id);if(item)item.unread_count=0;
    renderContext();
    if(note && $('noteText'))$('noteText').value=note;
    renderConversationList();
   }
  }
 }catch(e){
  const sync=$('inboxSync');
  if(sync && state.page==='Inbox')sync.textContent='Auto-refresh retrying · '+String(e.message||'Connection error');
 }finally{inboxRefreshBusy=false}
}
async function openConversation(id){state.chosen=id;renderConversationList();
 $('chatTitle').textContent='Loading conversation…';$('chatBody').innerHTML='<div class="loading">Loading messages…</div>';
 try{
  const [d,m]=await Promise.all([api('/api/conversations/'+id),api('/api/conversations/'+id+'/messages?limit=100')]);
  if(state.chosen!==id || state.page!=='Inbox')return; // prevent racing views from changing another conversation
  state.details=d.data;state.messages=(m.data||[]).reverse();
  const who=d.data.contact?.display_name||d.data.contact?.profile_name||d.data.contact?.wa_id||id;
  $('chatTitle').textContent=who;
  $('chatDesc').textContent=(d.data.contact?.wa_id||'')+' · '+d.data.status;
  paintChatHistory(true);renderContext();renderReplyComposer();renderConversationList();
  // Opening a conversation counts as reading it internally, but only after messages
  // have loaded. The backend verifies the exact unread snapshot before clearing.
  if(Number(d.data.unread_count)>0 && state.operator?.role!=='viewer'){
    try{
      const change=await api('/api/conversations/'+id+'/actions','POST',{
        action:'auto_mark_read',
        observed_last_message_at:d.data.last_message_at,
        observed_unread_count:d.data.unread_count
      });
      if(state.chosen===id && state.page==='Inbox' && change.marked_read){
        state.details.unread_count=0;
        const item=state.convs.find(x=>x.id===id);
        if(item)item.unread_count=0;
        renderContext();
        renderConversationList();
      }
      // Snapshot changed: leave unread intact, so newly arrived messages are not lost.
    }catch(e){
      if(state.chosen===id && state.page==='Inbox')
        toast('Auto Mark as Read unavailable. Use Mark read if needed.');
    }
  }
 }catch(e){$('chatTitle').textContent='Unable to open conversation';$('chatBody').textContent=e.message;toast(e.message)}
}
/**
 * Manual Stage B2 test reply.
 * The server independently checks operator, allowlisted number, 24h inbound window,
 * valid text and idempotency. The browser never receives the provider token.
 */
function renderReplyComposer(){
 const node=$('replyComposer');if(!node)return;
 const canWrite=state.operator?.role!=='viewer';
 if(!state.chosen||!state.details||!canWrite||testReplyAttempted.has(state.chosen)){ 
   node.replaceChildren();
   const note=document.createElement('div');note.className='disabledsend';
   note.textContent=!canWrite?'Read-only access: replies are not permitted.':testReplyAttempted.has(state.chosen)?'A test reply was already attempted for this conversation. Refresh the page and verify delivery before any further test.':'Select a conversation to send a controlled test reply.';
   node.appendChild(note);
   return;
 }
 node.innerHTML=`<label for="testReplyText" class="tiny"><b>Manual test reply</b> — allowed test recipient only, within 24 hours of their inbound message</label>
   <div class="btnrow" style="align-items:stretch;gap:8px;margin-top:8px">
     <textarea id="testReplyText" class="input" maxlength="4096" rows="2" style="flex:1;min-width:170px" placeholder="Write a test reply…"></textarea>
     <button id="testReplySend" class="primary" type="button">Send test reply</button>
   </div><p id="testReplyResult" class="muted tiny" role="status" aria-live="polite">No AI, templates or broadcasts. Do not send real customer messages.</p>`;
 const button=$('testReplySend');const input=$('testReplyText');const status=$('testReplyResult');
 button.onclick=async()=>{
   const text=input.value.trim();if(!text){status.textContent='Enter a test reply first.';return}
   if(text.length>4096){status.textContent='Message too long.';return}
   if(!window.confirm('Send ONE WhatsApp test reply to the allowlisted number? Only send if this is your test conversation.'))return;
   const conversationId=state.chosen;
   testReplyAttempted.add(conversationId);
   button.disabled=true;input.disabled=true;
   status.textContent='Submitting one test reply…';
   // Retry is intentionally disabled after an uncertain response to prevent duplicate messages.
   const requestId=crypto.randomUUID();
   try {
     const reply=await api('/api/conversations/'+conversationId+'/reply','POST',{text,request_id:requestId});
     if(reply.ok){
       status.textContent='Meta accepted this test reply. Checking message history…';
       if(state.chosen===conversationId)await openConversation(conversationId);
       toast('Test reply accepted by Meta');
     } else {
       status.textContent=reply.warning||'Provider result uncertain. Do not resend; check message history.';
     }
   }catch(e){
     status.textContent=(e.message||'Could not verify delivery')+' — Do not retry until delivery is checked.';
   }
   // The composer is deliberately not reenabled for this conversation until refreshed.
 };
}

function renderContext(){const panel=$('contextBody');if(!panel||!state.details)return;
 const c=state.details,who=c.contact||{},canWrite=state.operator.role!=='viewer';
 panel.innerHTML=`<div class="inforow"><span>Contact</span><b>${h(who.display_name||who.profile_name||'—')}</b></div><div class="inforow"><span>WhatsApp ID</span><b>${h(who.wa_id||'—')}</b></div><div class="inforow"><span>Status</span><b>${h(c.status)}</b></div><div class="inforow"><span>Unread</span><b>${Number(c.unread_count||0)}</b></div>${canWrite?`<h3>Internal actions</h3><div class="btnrow"><button class="btn" id="markRead">Mark read</button><button class="btn" id="resolveBtn">${c.status==='resolved'?'Reopen':'Resolve'}</button><button class="btn" id="takeoverBtn">Human takeover</button></div><label for="noteText">Internal note (not sent to WhatsApp)</label><textarea id="noteText" class="input" maxlength="4000" placeholder="Enter internal notes…"></textarea><button id="saveNote" class="primary">Save internal note</button>`:'<div class="notice secure">Viewer role — read-only.</div>'}`;
 if(!canWrite)return;
 $('markRead').onclick=()=>act('mark_read');$('resolveBtn').onclick=()=>act(c.status==='resolved'?'reopen':'resolve');$('takeoverBtn').onclick=()=>act('takeover');
 $('saveNote').onclick=()=>{const txt=$('noteText').value;if(!txt.trim())return toast('Enter a note');act('note',{text:txt})};
}
async function act(action,data={}){if(!state.chosen)return;
 try{await api('/api/conversations/'+state.chosen+'/actions','POST',{action,...data});toast('Internal action saved');state.convs=(await api('/api/conversations?limit=50')).data||[];await openConversation(state.chosen)}catch(e){toast(e.message)}}

let contactEditorId=null;
function parseContactCsv(source){
 if(typeof source!=='string'||source.length>100000)throw new Error('CSV must be under 100KB');
 let quoted=false,field='',row=[],matrix=[];
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(ch==='"'){if(quoted&&source[i+1]==='"'){field+='"';i++}else if(quoted||field==='')quoted=!quoted;else throw new Error('Invalid CSV quote')}
  else if(ch===','&&!quoted){row.push(field);field=''}
  else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))matrix.push(row);row=[];field=''}
  else field+=ch;
 }
 if(quoted)throw new Error('Unclosed CSV quote');
 row.push(field);if(row.some(v=>v.trim()))matrix.push(row);
 const heads=(matrix.shift()||[]).map(v=>v.trim().toLowerCase().replace(/^\uFEFF/,''));
 const wa=heads.indexOf('wa_id');
 if(wa<0||!matrix.length||matrix.length>100)throw new Error('CSV requires wa_id header and 1–100 contact rows');
 const name=heads.indexOf('display_name'),language=heads.indexOf('language_code'),tag=heads.indexOf('tags');
 return matrix.map((r,i)=>{
  const wa_id=(r[wa]||'').replace(/\D/g,'');
  if(!/^[1-9][0-9]{5,19}$/.test(wa_id))throw new Error('Invalid number at row '+(i+2));
  return {wa_id,display_name:name<0?'':r[name]||'',
   language_code:language<0?'ta':r[language]||'ta',
   tags:tag<0?[]:(r[tag]||'').split(';').map(v=>v.trim()).filter(Boolean)};
 });
}
async function reloadContacts(){
 if(state.page!=='Contacts')return;
 const r=await api('/api/contacts?limit=100');
 if(state.page!=='Contacts')return;
 state.contacts=r.data||[];state.contactsHasMore=state.contacts.length===100;renderContacts();
}
function renderContacts(){
 const rows=state.contacts;
 const canEdit=state.operator?.role==='admin'||state.operator?.role==='manager';
 const rowHtml=rows.map(c=>'<tr><td>'+h(c.display_name||c.profile_name||'—')+
  '</td><td>'+h(c.wa_id)+'</td><td>'+h(c.language_code||'—')+
  '</td><td>'+(c.opted_in?'Opt-in recorded':'Not opted-in')+'</td><td>'+
  (canEdit?'<button class="btn" type="button" data-edit-contact="'+h(c.id)+'">Edit</button>':'Read only')+
  '</td></tr>').join('');
 let html=header('Contacts','Independent WhatsApp Contacts · Marketing Sending OFF')+
  notice('No contact is imported as opted-in. Consent requires explicit evidence; sending remains disabled.')+
  '<section class="card"><div class="panelhead"><h2>Authorized Contacts</h2><span class="pill blue">'+rows.length+' loaded</span></div>'+
  (rows.length?'<div style="overflow:auto"><table class="data-table"><thead><tr><th>Name</th><th>WhatsApp Number</th><th>Language</th><th>Consent</th><th></th></tr></thead><tbody>'+rowHtml+'</tbody></table></div>':'<div class="empty">No authorized contacts found.</div>')+
  (state.contactsHasMore?'<button type="button" class="btn" id="contactMore">Load more</button>':'')+'</section>';
 if(canEdit){
  html+='<section class="card"><h2>Add / Edit Contact</h2><form id="contactForm">'+
   '<label for="contactWa">WhatsApp Number (with country code)</label><input class="input" id="contactWa" maxlength="20" placeholder="919876543210" required />'+
   '<label for="contactName">Name</label><input class="input" id="contactName" maxlength="100" />'+
   '<label for="contactLang">Language</label><select class="input" id="contactLang"><option value="ta">Tamil</option><option value="en">English</option><option value="ta-IN">Tamil India</option><option value="en-IN">English India</option></select>'+
   '<label for="contactTags">Tags (comma-separated, maximum 12)</label><input class="input" id="contactTags" />'+
   '<div class="btnrow"><button class="primary" type="submit" id="saveContact">Add Contact</button><button class="btn" type="button" id="clearContact">Clear</button></div>'+
   '<p id="contactResult" role="status"></p></form>'+
   '<h3>Explicit Marketing Consent</h3><p id="contactSelection" class="muted">Select a contact above to record consent.</p>'+
   '<label for="consentSource">Proof source</label><select class="input" id="consentSource"><option value="whatsapp_inbound_request">Customer WhatsApp Request</option><option value="signed_paper">Signed Paper</option><option value="web_form">Web Form</option><option value="direct_request">Direct Request</option></select>'+
   '<label for="consentEvidence">Evidence reference, 6–160 characters</label><input class="input" id="consentEvidence" maxlength="160" />'+
   '<label><input type="checkbox" id="confirmConsent" /> I have verified explicit customer consent.</label>'+
   '<div class="btnrow"><button class="btn" id="contactOptIn" type="button">Record Opt-in</button><button class="btn" id="contactOptOut" type="button">Record Opt-out</button></div>'+
   '<p id="consentResult" role="status"></p></section>'+
   '<section class="card"><h2>CSV Import</h2><p>Headers: wa_id,display_name,language_code,tags. Separate tags with semicolons. Maximum 100 rows and 100KB. Duplicate numbers are skipped. No imported customer is opted-in.</p>'+
   '<input id="contactsCsv" class="input" aria-label="Select contacts CSV" type="file" accept=".csv,text/csv" />'+
   '<button class="btn" id="importContacts" type="button">Import CSV</button><p id="importReport" role="status"></p></section>';
 }
 content(html);
 const more=$('contactMore');
 if(more)more.onclick=async()=>{
  more.disabled=true;
  try{
   const response=await api('/api/contacts?limit=100&offset='+state.contacts.length);
   if(state.page!=='Contacts')return;
   const newRows=response.data||[];
   const ids=new Set(state.contacts.map(x=>x.id));
   state.contacts.push(...newRows.filter(x=>!ids.has(x.id)));
   state.contactsHasMore=newRows.length===100;
   renderContacts();
  }catch(e){toast(e.message)}finally{more.disabled=false}
 };
 if(!canEdit)return;
 const clear=()=>{contactEditorId=null;$('contactWa').disabled=false;$('contactWa').value='';
  $('contactName').value='';$('contactLang').value='ta';$('contactTags').value='';
  $('saveContact').textContent='Add Contact';$('contactSelection').textContent='Select a contact above to record consent.';};
 $('clearContact').onclick=clear;
 document.querySelectorAll('[data-edit-contact]').forEach(button=>button.onclick=()=>{
  const c=rows.find(x=>x.id===button.dataset.editContact);
  if(!c)return;
  contactEditorId=c.id;$('contactWa').value=c.wa_id;$('contactWa').disabled=true;
  $('contactName').value=c.display_name||'';
  $('contactLang').value=c.language_code||'ta';
  $('contactTags').value=(c.tags||[]).join(', ');
  $('saveContact').textContent='Save Contact';
  $('contactSelection').textContent='Selected: '+(c.display_name||c.wa_id)+(c.opted_in?' (opted in)':' (not opted in)');
  $('consentEvidence').value='';$('confirmConsent').checked=false;
 });
 $('contactForm').onsubmit=async event=>{
  event.preventDefault();const button=$('saveContact');button.disabled=true;
  try{
   const body={action:contactEditorId?'update':'create',display_name:$('contactName').value,
     language_code:$('contactLang').value,tags:$('contactTags').value.split(',').map(v=>v.trim()).filter(Boolean)};
   if(!contactEditorId)body.wa_id=$('contactWa').value.replace(/\D/g,'');
   await api(contactEditorId?'/api/contacts/'+contactEditorId:'/api/contacts','POST',body);
   contactEditorId=null;toast('Contact saved; no marketing message sent');await reloadContacts();
  }catch(e){$('contactResult').textContent=e.message}finally{button.disabled=false}
 };
 $('contactOptIn').onclick=async()=>{
  if(!contactEditorId)return toast('Select contact first');
  if(!$('confirmConsent').checked)return toast('Confirm explicit evidence');
  const b=$('contactOptIn');b.disabled=true;
  try{await api('/api/contacts/'+contactEditorId,'POST',{action:'record_opt_in',source:$('consentSource').value,proof_ref:$('consentEvidence').value});
   contactEditorId=null;toast('Consent evidence recorded, sending remains OFF');await reloadContacts();
  }catch(e){$('consentResult').textContent=e.message}finally{b.disabled=false}
 };
 $('contactOptOut').onclick=async()=>{
  if(!contactEditorId)return toast('Select contact first');
  if(!window.confirm('Record opt-out for this contact?'))return;
  const b=$('contactOptOut');b.disabled=true;
  try{await api('/api/contacts/'+contactEditorId,'POST',{action:'opt_out'});
   contactEditorId=null;toast('Opt-out recorded');await reloadContacts();
  }catch(e){$('consentResult').textContent=e.message}finally{b.disabled=false}
 };
 $('importContacts').onclick=async()=>{
  const file=$('contactsCsv').files?.[0];
  if(!file)return toast('Choose a CSV file first');
  const button=$('importContacts');button.disabled=true;
  try{
   if(file.size>100000)throw new Error('Maximum 100KB');
   const contacts=parseContactCsv(await file.text());
   const report=await api('/api/contacts','POST',{action:'import',contacts});
   $('importReport').textContent='Inserted: '+report.inserted+'; skipped existing: '+report.existing_skipped+
    '; duplicate rows in file: '+report.duplicate_in_file+'; all new contacts not opted-in.';
   toast('Import completed. Refresh Contacts to see new records.');
  }catch(e){$('importReport').textContent=e.message}finally{button.disabled=false}
 };
}

const planned={
 'AI Assistant':['Human-approved AI communication','Knowledge-based AI replies require their separate integration and approval. AI auto-replies remain disabled.'],
 'Automation Studio':['Controlled workflow engine','Automation execution is not enabled in staging. Existing workflow definitions will not execute or message customers.'],
 'Templates':['Meta template synchronisation','Approved WhatsApp templates will be retrieved after Meta staging connection is verified. No approval statuses are simulated.'],
 'Broadcast':['Opt-in and campaign safeguards','Bulk WhatsApp sending is OFF. No recipients are queued and no campaigns are dispatched.'],
};
function renderPlanned(name){const [title,desc]=planned[name]||['Module pending','Production integration is not enabled'];
 content(header(name,'Module visible for staged rollout · restricted functionality')+notice('This is a staging workspace. The module is intentionally disabled until its provider integration, permissions and end-to-end tests pass.')+
 `<div class="tipgrid"><div class="card tip"><b>${h(title)}</b><p>${h(desc)}</p><span class="pill amber">Not enabled</span></div><div class="card tip"><b>Security</b><p>Account permissions are enforced by the FSP Connect backend. No simulated approvals or deliveries.</p><span class="pill green">Protected</span></div><div class="card tip"><b>Next integration</b><p>Meta WhatsApp test number, webhook, provider templates, and controlled test traffic.</p><span class="pill">Stage B follow-up</span></div></div>`);
}
function renderSettings(){const op=state.operator||{};
 content(header('Settings','Workspace access and staging operational controls')+
 `<div class="twocol"><section class="card modulebox"><h2>Signed-in operator</h2><div class="inforow"><span>Name</span><b>${h(op.name)}</b></div><div class="inforow"><span>Role</span><b>${h(roleTag(op.role))}</b></div><div class="inforow"><span>Account</span><b>${h(op.id)}</b></div><button class="btn danger" type="button" id="settingsLogout">Sign out</button></section><section class="card modulebox"><h2>Staging safety</h2><div class="inforow"><span>Unrestricted WhatsApp sending</span><b class="pill amber">Disabled</b></div><div class="inforow"><span>Broadcast</span><b class="pill amber">Disabled</b></div><div class="inforow"><span>AI Auto Reply</span><b class="pill amber">Disabled</b></div><div class="inforow"><span>Automation</span><b class="pill amber">Disabled</b></div></section></div>`+
 (op.role==='admin'? `<section class="card modulebox" style="margin-top:16px">
    <h2>Meta WhatsApp connection</h2>
    <p>Checks saved configuration and the linked WhatsApp sender using a read-only Meta request.
       No WhatsApp message will be sent.</p>
    <button type="button" class="btn" id="metaCheckBtn">Check Meta Connection</button>
    <p id="metaCheckResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Production Go-Live Gates — Stage 5</h3>
    <p>Read-only release assessment. All approvals and restore tests must pass separately. This cannot enable customer messaging.</p>
    <button type="button" class="btn" id="productionGatesBtn">Check Production Gates</button>
    <p id="productionGatesResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Backup & Recovery — Stage 6</h3>
    <p>Verify live database relationships without exporting customer data. A real backup and independent restore are separate pending gates.</p>
    <button type="button" class="btn" id="recoveryPreflightBtn">Run Recovery Preflight</button>
    <p id="recoveryPreflightResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Multi-Operator Access Readiness — Stage 6</h3>
    <p>Shows active operator role counts only. Creating real test logins and validating separate sessions remains a release gate.</p>
    <button type="button" class="btn" id="operatorCoverageBtn">Check Operator Coverage</button>
    <p id="operatorCoverageResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Privacy & Data Retention — Stage 7</h3>
    <p>Read-only age inventory. No customer data is exported, deleted or archived; retention terms still require approval.</p>
    <button type="button" class="btn" id="retentionInventoryBtn">Check Retention Inventory</button>
    <p id="retentionInventoryResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Incident Response Readiness — Stage 7</h3>
    <p>Inspect monitor freshness, incidents and escalation readiness without contacting customers or taking recovery actions.</p>
    <button type="button" class="btn" id="incidentReadinessBtn">Check Incident Readiness</button>
    <p id="incidentReadinessResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Production Manual Reply Readiness</h3>
    <p>Read-only rollout check. This does not unlock customer messaging.</p>
    <button type="button" class="btn" id="replyReadinessBtn">Check Reply Readiness</button>
    <p id="replyReadinessResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Manual Reply Operations — Last 24 Hours</h3>
    <p>Read-only audit counts. No customer content is displayed and no message will be sent.</p>
    <button type="button" class="btn" id="replyOperationsBtn">Check Reply Operations</button>
    <p id="replyOperationsResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px"></p>
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0" />
    <h3 style="margin:0 0 8px">Operational Alerts — Internal Monitor</h3>
    <p>Checks failed replies, delayed delivery and webhook processing every five minutes. No external messages are sent.</p>
    <button type="button" class="btn" id="alertCheckBtn">Refresh Operational Alerts</button>
    <p id="alertCheckResult" role="status" aria-live="polite" style="white-space:pre-line;margin-top:12px">Checking internal monitoring…</p>
  </section>` : '') );
 $('settingsLogout').onclick=signOut;
 const operatorCoverage=$('operatorCoverageBtn');
 if(operatorCoverage)operatorCoverage.onclick=async()=>{
  operatorCoverage.disabled=true;
  const output=$('operatorCoverageResult');
  output.textContent='Checking operator role coverage…';
  try{
   const data=await api('/api/operator-coverage');
   const roles=data.active_counts||{};
   const num=v=>Number.isSafeInteger(v)?v:'Not verified';
   const lines=[
    'Active Operators: '+num(data.total_active),
    'Admin: '+num(roles.admin)+' · Manager: '+num(roles.manager),
    'Agent: '+num(roles.agent)+' · Viewer: '+num(roles.viewer),
    'Independent multi-operator login QA: NOT VERIFIED',
    'Role matrix logic: covered by automated tests.',
    'Production multi-operator approval: NOT READY',
    'This check cannot create users or change permissions.'
   ];
   if(state.page==='Settings')output.textContent=lines.join('\n');
  }catch(e){
   if(state.page==='Settings')output.textContent='Operator audit unavailable: '+String(e.message||'Connection error');
  }finally{if(state.page==='Settings')operatorCoverage.disabled=false;}
 };
 const recoveryPreflight=$('recoveryPreflightBtn');
 if(recoveryPreflight)recoveryPreflight.onclick=async()=>{
  recoveryPreflight.disabled=true;
  const output=$('recoveryPreflightResult');
  output.textContent='Checking database relationships…';
  try{
   const info=await api('/api/recovery-preflight');
   const counts=info.counts||{};
   const links=info.orphan_checks||{};
   const num=value=>Number.isSafeInteger(value)?value:'Not verified';
   const lines=[
    'Relational integrity: '+String(info.relational_integrity||'unverified').toUpperCase(),
    'Contacts: '+num(counts.contacts)+' · Conversations: '+num(counts.conversations),
    'Messages: '+num(counts.messages)+' · Reply ledger: '+num(counts.outbound_requests),
    'Orphan messages: '+num(links.orphan_messages),
    'Orphan conversations: '+num(links.orphan_conversations),
    'Orphan reply requests: '+num(links.orphan_reply_requests),
    'Orphan rate reservations: '+num(links.orphan_rate_reservations),
    'Off-site backup artifact: NOT VERIFIED',
    'Independent restore: NOT VERIFIED',
    'No customer data was exported or restored by this check.'
   ];
   if(state.page==='Settings')output.textContent=lines.join('\n');
  }catch(e){
   if(state.page==='Settings')output.textContent='Recovery preflight unavailable: '+String(e.message||'Connection error');
  }finally{if(state.page==='Settings')recoveryPreflight.disabled=false}
 };
 const productionGates=$('productionGatesBtn');
 if(productionGates)productionGates.onclick=async()=>{
  productionGates.disabled=true;
  const panel=$('productionGatesResult');
  panel.textContent='Checking live release prerequisites…';
  try{
   const data=await api('/api/production-gates');
   const counts=data.results||{};
   const lines=[
    'Customer-wide Sending: OFF (test recipient only)',
    'Production Ready: NO',
    'Passed: '+Number(counts.pass||0)+'  ·  Blocked: '+Number(counts.blocked||0)+
      '  ·  Not verified: '+Number(counts.unverified||0),
    'Release Gate Details:'
   ];
   for(const gate of data.gates||[]){
    const stateText=gate.status==='pass'?'PASS':gate.status==='blocked'?'BLOCKED':'NOT VERIFIED';
    lines.push('• '+stateText+' — '+String(gate.title||'Release prerequisite'));
    if(gate.status!=='pass'&&gate.detail)lines.push('    '+String(gate.detail));
   }
   lines.push('This report does not approve or enable sending.');
   if(state.page==='Settings')panel.textContent=lines.join('\n');
  }catch(e){
   if(state.page==='Settings')panel.textContent='Release review unavailable: '+String(e.message||'Connection error');
  }finally{if(state.page==='Settings')productionGates.disabled=false}
 };
 const retentionButton=$('retentionInventoryBtn');
 if(retentionButton)retentionButton.onclick=async()=>{
  retentionButton.disabled=true;
  const output=$('retentionInventoryResult');
  output.textContent='Checking private retention inventory…';
  try{
   const data=await api('/api/retention-inventory');
   const lines=[
    'Inventory: '+(data.inventory_complete?'COUNTS VERIFIED':'INCOMPLETE'),
    'Retention policy: NOT APPROVED',
    'Automatic deletion: OFF',
    'Legal hold and backup-retention reviews: NOT VERIFIED',
    'Age buckets (counts only):'
   ];
   const count=v=>Number.isSafeInteger(v)?v:'Unknown';
   for(const cat of data.categories||[]){
    lines.push('• '+cat.label+': '+count(cat.total)+' total; older 30d '+count(cat.older_30_days)+
       ', 90d '+count(cat.older_90_days)+', 365d '+count(cat.older_365_days));
   }
   lines.push('No records were exported, archived or deleted.');
   if(state.page==='Settings')output.textContent=lines.join('\n');
  }catch(e){
   if(state.page==='Settings')output.textContent='Retention inventory unavailable: '+String(e.message||'Connection error');
  }finally{if(state.page==='Settings')retentionButton.disabled=false;}
 };
 const incidentButton=$('incidentReadinessBtn');
 if(incidentButton)incidentButton.onclick=async()=>{
  incidentButton.disabled=true;
  const output=$('incidentReadinessResult');
  output.textContent='Checking incident response prerequisites…';
  try{
   const data=await api('/api/incident-readiness');
   const lines=[
    'Assessment: '+String(data.assessment||'Unknown').replaceAll('_',' ').toUpperCase(),
    'Monitor: '+(data.monitoring_fresh?'ACTIVE':'STALE / UNVERIFIED'),
    'Open incidents: '+(Number.isSafeInteger(data.open_alert_count)?data.open_alert_count:'Unknown'),
    'Critical incidents: '+(Number.isSafeInteger(data.critical_alert_count)?data.critical_alert_count:'Unknown'),
    'Webhook backlog: '+(Number.isSafeInteger(data.queued_or_dead_webhooks)?data.queued_or_dead_webhooks:'Unknown'),
    'Incident owner: NOT ASSIGNED',
    'Live response drill: NOT VERIFIED',
    'External alert notifications: OFF',
    'Production incident readiness: NOT VERIFIED',
    'Incident response procedure:'
   ];
   for(const step of data.actions||[])lines.push('• '+step);
   if(state.page==='Settings')output.textContent=lines.join('\n');
  }catch(e){
   if(state.page==='Settings')output.textContent='Incident readiness unavailable: '+String(e.message||'Connection error');
  }finally{if(state.page==='Settings')incidentButton.disabled=false;}
 };
 const readiness=$('replyReadinessBtn');
 if(readiness)readiness.onclick=async()=>{
  readiness.disabled=true;
  const panel=$('replyReadinessResult');
  panel.textContent='Checking rollout gates…';
  try{
   const result=await api('/api/reply-readiness');
   const gates=result.checks||{};
   panel.textContent=[
    'Mode: '+String(result.mode||'unknown'),
    'Test-only sending: '+(gates.restricted_test_sending?'Ready':'Not ready'),
    '24-hour window: '+(gates.incoming_24h_window_enforced?'Enforced':'Pending'),
    'Duplicate prevention: '+(gates.idempotent_claim_before_send?'Enabled':'Pending'),
    'Staging rate gate: '+(gates.staging_durable_rate_gate_implemented?'Implemented':'Pending'),
    'Production customer replies: NOT ENABLED',
    'Release blockers:',
    ...(result.blockers||[]).map(b=>'• '+b)
   ].join('\n');
  }catch(e){panel.textContent='Unable to check: '+String(e.message||'Unknown error')}
  finally{readiness.disabled=false}
 };
 const operations=$('replyOperationsBtn');
 if(operations)operations.onclick=async()=>{
  operations.disabled=true;
  const panel=$('replyOperationsResult');panel.textContent='Loading secure reply audit…';
  try{
   const data=await api('/api/reply-operations');
   const count=value=>Number.isSafeInteger(Number(value))?Number(value):'—';
   panel.textContent=[
    'Mode: Restricted test recipient only',
    'Attempts: '+count(data.attempts),
    'Accepted: '+count(data.accepted),
    'Rate limited: '+count(data.rate_limited),
    'Uncertain provider results: '+count(data.unknown),
    'Inbox persistence failures: '+count(data.persist_failed),
    'Provider failed messages: '+count(data.provider_failed),
    'Needs manual review: '+count(data.needs_review),
    'Rate limit database gate: '+(data.database_rate_gate?'Active':'Unknown'),
    'Production customer sending: OFF'
   ].join('\n');
  }catch(e){panel.textContent='Unable to load operational audit: '+String(e.message||'Connection error')}
  finally{operations.disabled=false;}
 };
 const alertButton=$('alertCheckBtn');
 const alertPanel=$('alertCheckResult');
 if(alertButton&&alertPanel){
  const reloadAlerts=async()=>{
   alertButton.disabled=true;
   alertPanel.textContent='Checking internal monitor…';
   try{
    const result=await api('/api/operational-alerts');
    if(state.page!=='Settings')return;
    const status=result.monitor_fresh?'MONITOR ACTIVE':'MONITOR STALE — check cron job';
    const lines=[
     'Monitor: '+status,
     'Last checked: '+date(result.monitor_last_run),
     'Open alerts: '+Number(result.open_count||0),
     'Critical alerts: '+Number(result.critical_count||0)
    ];
    if(!result.monitor_fresh)lines.push('WARNING: Freshness verification failed. Do not assume zero incidents.');
    for(const alert of result.alerts||[]){
     lines.push('• '+(alert.severity==='critical'?'CRITICAL':'WARNING')+' — '+
       String(alert.label||'Operational issue')+' (seen '+String(alert.occurrences||1)+' times)');
    }
    if(result.monitor_fresh && Number(result.open_count)===0)lines.push('No active operational alerts.');
    lines.push('No automatic customer messages or external notifications.');
    alertPanel.textContent=lines.join('\n');
   }catch(e){
    if(state.page==='Settings')alertPanel.textContent='Monitoring unavailable: '+String(e.message||'Connection error');
   }finally{if(state.page==='Settings')alertButton.disabled=false;}
  };
  alertButton.onclick=()=>{void reloadAlerts()};
  void reloadAlerts();
 }
 const checkButton=$('metaCheckBtn');
 if(checkButton){
   checkButton.onclick=async()=>{
     checkButton.disabled=true;
     const resultPanel=$('metaCheckResult');
     resultPanel.textContent='Checking connection…';
     try{
       const r=await api('/api/meta/connection-check');
       const stateName=(value)=>value?'Configured':'Missing or invalid';
       const lines=[
         'Access Token: '+stateName(r.accessTokenConfigured),
         'Phone Number ID: '+stateName(r.phoneNumberIdConfigured),
         'Test Recipient: '+stateName(r.testRecipientConfigured),
         'Meta Graph API: '+String(r.graphAccess||'not_checked'),
         'Sender number suffix: '+String(r.senderSuffix||'Unavailable'),
         'Sending: '+(r.sendingEnabled?'ENABLED — review before testing':'OFF (safe)')
       ];
       resultPanel.textContent=lines.join('\n');
     }catch(e){resultPanel.textContent='Connection check could not finish: '+String(e.message||'Unknown error')}
     finally{checkButton.disabled=false;}
   };
 }

}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('loginBtn');btn.disabled=true;btn.textContent='Authenticating…';$('loginError').classList.add('hide');try{await login($('loginEmail').value.trim(),$('loginPassword').value)}catch(err){showAuth(err.message)}finally{btn.disabled=false;btn.textContent='Sign in securely';$('loginPassword').value=''}});
$('forgotBtn').onclick=async()=>{
 const email=$('loginEmail').value.trim();if(!email){showAuth('Enter your registered operator email first, then click Forgot password.');return}
 try{await authCall('recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),'POST',{email});toast('If that account exists, a password reset email will be sent.')}catch(e){showAuth('Password reset is not available until authorised redirect URLs are configured.')}
};
$('recoveryForm').addEventListener('submit',async(e)=>{e.preventDefault();try{
 const pw=$('newPassword').value;if(pw.length<12)throw new Error('Use at least 12 characters');
 await authCall('user','PUT',{password:pw},state.session.access_token);
 $('recoveryForm').classList.add('hide');$('loginForm').classList.remove('hide');toast('Password updated. Sign in again.');clearSession();
 }catch(err){showAuth(err.message)}});
$('signOutNav').onclick=signOut;$('signOutTop').onclick=signOut;
window.addEventListener('storage',event=>{
 if(event.key!==sessionName)return;
 if(event.newValue===null && state.session){
  clearSession();
  showAuth('Signed out in another tab.');
 }else if(event.newValue && state.session){
  // Keep rotated access/refresh credentials synchronized between open tabs.
  try{
   const renewed=JSON.parse(event.newValue);
   if(typeof renewed.access_token==='string' && typeof renewed.refresh_token==='string')
    state.session=renewed;
  }catch{}
 }
});
$('menuBtn').onclick=()=>$('appScreen').classList.toggle('expanded');
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible' && state.page==='Inbox')void refreshInboxQuietly();
});
window.addEventListener('unhandledrejection',()=>toast('Request failed. Please refresh.'));
(async function boot(){
 // Password-recovery tokens must never remain in address bar/history.
 if(location.hash){const kv=new URLSearchParams(location.hash.slice(1));
  if(kv.get('type')==='recovery'&&kv.get('access_token')){
   clearSession();state.session={access_token:kv.get('access_token'),refresh_token:kv.get('refresh_token'),expires_at:Math.floor(Date.now()/1000)+Number(kv.get('expires_in')||3600)}; // Recovery sessions are not persisted.
   $('loginForm').classList.add('hide');$('recoveryForm').classList.remove('hide');$('loginTitle').textContent='Reset your password';
  }
  history.replaceState(null,'',location.pathname+location.search);
 }
 if(!$('recoveryForm').classList.contains('hide'))return;
 try{
  let stored=null;
  try{stored=localStorage.getItem(sessionName)}catch{}
  if(!stored){try{stored=sessionStorage.getItem(sessionName)}catch{}}
  if(stored){state.session=JSON.parse(stored);saveSession(state.session)}
  if(state.session){const me=await api('/api/me');state.operator=me;showApp();await navigate('Overview')}
  else showAuth();
 }catch(e){
  const message=String(e?.message||'');
  // Keep the remembered session when the network/backend is temporarily unavailable.
  if(/session expired|session invalid|refresh token|invalid grant|sign in required|not authorised|not activated/i.test(message)){
   clearSession();showAuth('Your session has ended. Sign in again.');
  }else showAuth('Unable to reconnect. Check your connection, then refresh this page.');
 }
})();