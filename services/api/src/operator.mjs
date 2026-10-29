import { randomUUID } from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkId(s){return typeof s==='string' && uuid.test(s);}
function fail(res,code,msg){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify({error:msg}));}
function ok(res,code,data){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data));}
const encode=v=>encodeURIComponent(v);
const privileged=op=>['admin','manager'].includes(op.role);
function accessible(op,c){return privileged(op) || c?.assigned_to===op.user_id;}
async function parseBody(req,max=8192){let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>max)throw new Error('oversize');chunks.push(part)};const body=JSON.parse(Buffer.concat(chunks).toString());if (!body || Array.isArray(body) || typeof body!=='object')throw new Error('invalid body');return body;}
export async function handleOperatorRequest(req,res,url,db){
  const matched=url.pathname.match(/^\/api\/conversations\/([0-9a-f-]+)(?:\/(messages|actions))?$/i);
  const isRoute=['/api/me','/api/conversations','/api/contacts'].includes(url.pathname)||Boolean(matched);
  if(!isRoute)return false;
  if(!db){fail(res,503,'Service unavailable');return true;}
  const token=/^Bearer (\S+)$/i.exec(String(req.headers.authorization??''))?.[1];
  if(!token){fail(res,401,'Authentication required');return true;}
  try {
    const user=await db.verifyUser(token);
    if(!user){fail(res,401,'Invalid or expired session');return true;}
    const rows=await db.table('fsp_operators','?select=user_id,role,active,display_name&user_id=eq.'+encode(user.id)+'&limit=1');
    const op=rows?.[0];
    if(!op?.active){fail(res,403,'Operator disabled or not provisioned');return true;}
    if(url.pathname==='/api/me'&&req.method==='GET'){ok(res,200,{id:op.user_id,role:op.role,display_name:op.display_name});return true;}
    if(matched&&!checkId(matched[1])){fail(res,400,'Invalid id');return true;}
    const limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit'))||25));
    const offset=Math.min(100000,Math.max(0,Number(url.searchParams.get('offset'))||0));
    const paging='&limit='+limit+'&offset='+offset;
    if(url.pathname==='/api/conversations'&&req.method==='GET'){
      const scope=privileged(op)?'':'&assigned_to=eq.'+encode(op.user_id);
      const rows=await db.table('whatsapp_conversations','?select=id,contact_id,status,assigned_to,ai_enabled,last_message_at,unread_count,created_at'+scope+'&order=last_message_at.desc.nullslast'+paging);
      ok(res,200,{data:rows??[],limit,offset});return true;
    }
    if(url.pathname==='/api/contacts'&&req.method==='GET'){
      // Contact scope is enforced through authorized conversations; no broad unassigned contact browsing.
      const scope=privileged(op)?'':'&assigned_to=eq.'+encode(op.user_id);
      const convs=await db.table('whatsapp_conversations','?select=contact_id'+scope+'&limit=500');
      const ids=[...new Set((convs??[]).map(c=>c.contact_id))];
      if(ids.length===0){ok(res,200,{data:[]});return true;}
      const contacts=await db.table('whatsapp_contacts','?select=id,wa_id,display_name,profile_name,language_code,source,tags,last_message_at&id=in.('+ids.map(encode).join(',')+')'+paging);
      ok(res,200,{data:contacts??[]});return true;
    }
    if(matched){
      const id=matched[1];
      const found=await db.table('whatsapp_conversations','?select=id,contact_id,status,assigned_to,ai_enabled,last_message_at,unread_count,created_at&id=eq.'+encode(id)+'&limit=1');
      const conv=found?.[0];
      if(!conv||!accessible(op,conv)){fail(res,404,'Conversation not found');return true;}
      if(req.method==='GET'&&!matched[2]){ok(res,200,{data:conv});return true;}
      if(req.method==='GET'&&matched[2]==='messages'){
        const messages=await db.table('whatsapp_messages','?select=id,provider_message_id,direction,sender_type,message_type,body,provider_status,provider_timestamp,created_at&conversation_id=eq.'+encode(id)+'&order=created_at.desc'+paging);
        ok(res,200,{data:messages??[]});return true;
      }
      if(req.method==='POST'&&matched[2]==='actions'){
        const b=await parseBody(req);
        const action=b.action;
        if(!['mark_read','resolve','reopen','takeover','pause_ai','resume_ai','assign','note'].includes(action))return fail(res,400,'Unsupported action'),true;
        if(op.role==='viewer')return fail(res,403,'Read-only operator'),true;
        if(action==='assign'&&!privileged(op))return fail(res,403,'Insufficient permission'),true;
        if(action==='assign'){
          if(!checkId(b.operator_id))return fail(res,400,'Invalid assignee'),true;
          const targets=await db.table('fsp_operators','?select=user_id,active&user_id=eq.'+encode(b.operator_id)+'&limit=1');
          if(!targets?.[0]?.active)return fail(res,400,'Inactive assignee'),true;
        }
        if(action==='note'&&(typeof b.text!=='string'||!b.text.trim()||b.text.length>4000))return fail(res,400,'Invalid note'),true;
        let patch={};
        switch(action){
          case 'mark_read':patch={unread_count:0};break;
          case 'resolve':patch={status:'resolved',closed_at:new Date().toISOString()};break;
          case 'reopen':patch={status:'open',closed_at:null};break;
          case 'takeover':patch={ai_enabled:false,assigned_to:op.user_id,handoff_requested_at:new Date().toISOString()};break;
          case 'pause_ai':patch={ai_enabled:false};break;
          case 'resume_ai':if(!privileged(op))return fail(res,403,'Manager approval required'),true;patch={ai_enabled:true};break;
          case 'assign':patch={assigned_to:b.operator_id};break;
        }
        // Audit note is internal-only: never create an outbound WhatsApp message.
        if(action==='note'){
          await db.table('fsp_operator_audit','',{method:'POST',body:{operator_id:op.user_id,conversation_id:id,action,details:{text:b.text.trim()}},headers:{Prefer:'return=minimal'}});
        } else {
          // Condition on existing ownership to avoid updating newly reassigned records.
          const condition=privileged(op)?'':'&assigned_to=eq.'+encode(op.user_id);
          const changed=await db.table('whatsapp_conversations','?id=eq.'+encode(id)+condition,{method:'PATCH',body:patch,headers:{Prefer:'return=representation'}});
          if(changed?.length!==1)return fail(res,409,'Conversation changed; retry'),true;
          await db.table('fsp_operator_audit','',{method:'POST',body:{operator_id:op.user_id,conversation_id:id,action,details:action==='assign'?{assignee:b.operator_id}:{}},headers:{Prefer:'return=minimal'}});
        }
        ok(res,200,{ok:true});return true;
      }
    }
    fail(res,405,'Method not allowed');return true;
  }catch(e){
    if(e.message==='oversize')fail(res,413,'Request too large');
    else if(e instanceof SyntaxError || e.message==='invalid body')fail(res,400,'Invalid JSON');
    else fail(res,503,'Backend unavailable');
    return true;
  }
}