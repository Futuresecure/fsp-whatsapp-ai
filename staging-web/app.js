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
const state={session:null,operator:null,page:'Overview',summary:null,convs:[],contacts:[],messages:[],chosen:null,details:null,operators:[],loading:false,offset:0};
const sessionName='fsp-connect-21-staging-tab-session';
const testReplyAttempted=new Set(); // one reply attempt per conversation per page session
function notice(text,secure=false){return `<div class="notice ${secure?'secure':''}">${h(text)}</div>`}
let toastTimer;
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hide');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hide'),4000)}
function showAuth(message=''){$('appScreen').classList.add('hide');$('loginScreen').classList.remove('hide');$('loginError').textContent=message;$('loginError').classList.toggle('hide',!message)}
function showApp(){$('loginScreen').classList.add('hide');$('appScreen').classList.remove('hide');$('avatar').textContent=(state.operator?.name||'FSP').slice(0,2).toUpperCase()}
function clearSession(){state.session=null;state.operator=null;state.summary=null;state.convs=[];state.contacts=[];state.chosen=null;state.messages=[];sessionStorage.removeItem(sessionName);localStorage.removeItem(sessionName)}
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
  const s=await authCall('token?grant_type=refresh_token','POST',{refresh_token:state.session.refresh_token});
  saveSession({...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)});
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
 saveSession({...s,expires_at:Math.floor(Date.now()/1000)+Number(s.expires_in||3600)});
 try{const op=await api('/api/me');state.operator=op;showApp();await navigate('Overview')}catch(e){clearSession();showAuth(e.message==='Your account is not authorised for this action'?'Login succeeded but your operator account is not active. Ask the administrator to assign a role.':e.message)}
}
async function signOut(){
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
 state.page=name;nav();
 if(name==='Overview'||name==='Analytics'){
  content(header(name,'Actual FSP Connect database activity · no fictional data')+'<div class="loading">Loading real data…</div>');
  try{state.summary=await api('/api/dashboard');renderOverview(name)}catch(e){renderError(e)}
 }else if(name==='Inbox'){
  content(header(name,'Live database conversations · manual test replies restricted')+'<div class="loading">Loading authorized conversations…</div>');
  try{state.convs=(await api('/api/conversations?limit=50')).data||[];await renderInbox()}catch(e){renderError(e)}
 }else if(name==='Contacts'){
  content(header(name,'Contacts visible to your operator role')+'<div class="loading">Loading contacts…</div>');
  try{state.contacts=(await api('/api/contacts?limit=50')).data||[];renderContacts()}catch(e){renderError(e)}
 }else if(name==='Settings')renderSettings();
 else renderPlanned(name);
}
function renderError(e){content(header(state.page,'Staging connection state')+notice(`Unable to load data: ${e.message}`))}
function stat(label,value,sub){return `<div class="card stat"><div class="eyebrow">${h(label)}</div><div class="num">${value===null?'—':Number(value||0).toLocaleString('en-IN')}</div><div class="trend">${h(sub)}</div></div>`}
function renderOverview(name){const s=state.summary||{};
 const scope=s.scope==='assigned'?'Only conversations assigned to you':'Workspace-wide activity';
 content(header(name,name==='Analytics'?'Verified database counts, not campaign-delivery estimates':'Your FSP Connect staging workspace')+
 notice('STAGING MODE — This is connected to the FSP Connect database. Inbound webhook receiver is deployed; Meta callback cutover is pending. Restricted test replies need an incoming test conversation and a valid service window.')+
 `<div class="statgrid">${stat('Conversations',s.conversations,scope)}${stat('Unread conversations',s.unread_conversations,'From Inbox database')}${stat('Contacts',s.contacts,s.contacts===null?'Available to Admin / Manager':'Stored customer contacts')}${stat('Message records',s.messages,s.messages===null?'Available to Admin / Manager':'Provider-backed records')}</div>`+
 `<div class="twocol"><section class="card modulebox"><h2>Communication workspace</h2><p>Read authorised conversations, inspect message history and manage internal operator actions. Manual test replies are restricted to the allowlisted number.</p><button id="openInbox" class="primary">Open Inbox</button></section><section class="card modulebox"><h2>Safety controls</h2><div class="inforow"><span>WhatsApp outgoing</span><b class="pill amber">Test allowlist only</b></div><div class="inforow"><span>AI Auto Reply</span><b class="pill amber">OFF</b></div><div class="inforow"><span>Broadcast / Automation</span><b class="pill amber">OFF</b></div></section></div>`);
 $('openInbox').onclick=()=>navigate('Inbox');
}
function titleFor(c){const d=state.details?.id===c.id?state.details.contact:null;return d?.display_name||d?.profile_name||'Conversation '+c.id.slice(0,8)}
function renderConversationList(){const node=$('conversationList');if(!node)return;
 node.replaceChildren();const q=($('convSearch')?.value||'').trim().toLowerCase();const items=state.convs.filter(c=>c.id.toLowerCase().includes(q)||c.status.toLowerCase().includes(q)||(state.details?.id===c.id&&titleFor(c).toLowerCase().includes(q)));
 if(!items.length){node.innerHTML='<div class="empty">No authorized conversations found.</div>';return}
 items.forEach(c=>{let b=document.createElement('button');b.type='button';b.className='conv'+(state.chosen===c.id?' active':'');
 const top=document.createElement('div');top.className='convtop';const title=document.createElement('b');title.textContent=titleFor(c);const time=document.createElement('small');time.textContent=date(c.last_message_at);top.append(title,time);
 const status=document.createElement('p');status.textContent='Status: '+c.status;
 const bot=document.createElement('div');bot.className='btnrow';const pill=document.createElement('span');pill.className='pill '+(c.unread_count?'blue':'');pill.textContent=c.unread_count?c.unread_count+' unread':'No unread';bot.appendChild(pill);
 b.append(top,status,bot);b.onclick=()=>openConversation(c.id);node.appendChild(b)});
}
async function renderInbox(){content(header('Inbox','Inbound messages and restricted manual test replies')+
 '<div class="inbox"><section class="convcol"><div class="colhead"><h2>Conversations</h2><input class="input" id="convSearch" aria-label="Search conversations" placeholder="Search conversation…" style="margin-top:12px" /></div><div id="conversationList" class="convlist"></div></section><section class="chatcol"><div class="chathead"><div><b id="chatTitle">Select a conversation</b><div class="muted tiny" id="chatDesc">Private message history</div></div><div class="btnrow"><span class="pill amber">Test replies only</span><button type="button" class="btn" id="detailsBtn">Details</button></div></div><div class="chatbody" id="chatBody"><div class="empty">Select a conversation to view real messages.</div></div><div class="composer" id="replyComposer"><div class="disabledsend">Select an authorized test conversation to reply. Test-recipient allowlist and 24-hour reply window are enforced.</div></div></section><section class="contextcol"><div class="colhead"><h2>Conversation details</h2></div><div class="contextbody" id="contextBody"><p class="muted tiny">Select a conversation.</p></div></section></div>');
 $('convSearch').oninput=renderConversationList;
 $('detailsBtn').onclick=()=>document.querySelector('.contextcol')?.classList.toggle('open');
 renderConversationList();if(state.chosen&&state.convs.some(c=>c.id===state.chosen))await openConversation(state.chosen);}
async function openConversation(id){state.chosen=id;renderConversationList();
 $('chatTitle').textContent='Loading conversation…';$('chatBody').innerHTML='<div class="loading">Loading messages…</div>';
 try{
  const [d,m]=await Promise.all([api('/api/conversations/'+id),api('/api/conversations/'+id+'/messages?limit=100')]);
  if(state.chosen!==id || state.page!=='Inbox')return; // prevent racing views from changing another conversation
  state.details=d.data;state.messages=(m.data||[]).reverse();
  const who=d.data.contact?.display_name||d.data.contact?.profile_name||d.data.contact?.wa_id||id;
  $('chatTitle').textContent=who;
  $('chatDesc').textContent=(d.data.contact?.wa_id||'')+' · '+d.data.status;
  const box=$('chatBody');box.replaceChildren();
  if(!state.messages.length)box.innerHTML='<div class="empty">No messages recorded for this conversation.</div>';
  state.messages.forEach(msg=>{const el=document.createElement('div');el.className='msg'+(msg.direction==='outbound'?' out':'');
   const b=document.createElement('div');b.className='bubble';b.textContent=msg.body??('['+msg.message_type+' message]');
   const small=document.createElement('div');small.className='msgmeta';small.textContent=msg.direction+' · '+msg.provider_status+' · '+date(msg.provider_timestamp||msg.created_at);
   el.append(b,small);box.appendChild(el)});
  box.scrollTop=box.scrollHeight;renderContext();renderReplyComposer();renderConversationList();
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
function renderContacts(){const rows=state.contacts;
 content(header('Contacts','Real contacts from the independent FSP Connect database')+notice('Contacts and consent must be verified before any future campaign. Import and marketing sends are not enabled.')+
 `<section class="card"><div class="panelhead"><h2>Authorized contacts</h2><span class="pill blue">${rows.length} loaded</span></div>${rows.length?`<div style="overflow:auto"><table class="data-table"><thead><tr><th>Name</th><th>WhatsApp ID</th><th>Language</th><th>Last message</th></tr></thead><tbody>${rows.map(c=>`<tr><td>${h(c.display_name||c.profile_name||'—')}</td><td>${h(c.wa_id)}</td><td>${h(c.language_code||'—')}</td><td>${h(date(c.last_message_at))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No contacts found. Live Meta messages have not been connected to this staging app.</div>'}</section>`);
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
  </section>` : '') );
 $('settingsLogout').onclick=signOut;
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
$('menuBtn').onclick=()=>$('appScreen').classList.toggle('expanded');
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
 }catch{clearSession();showAuth()}
})();