/** Stage B2 restricted human text reply foundation. Every guard is fail-closed. */
export const GRAPH_VERSION = 'v26.0';
const PHONE = /^[0-9]{6,20}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REPLY = 4096;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export function assessReply({operator, conversation, recipient, lastInboundAt, text, requestId, config, now=Date.now()}) {
  if (!operator?.active || !['admin','manager','agent'].includes(operator.role)) return {status:403,error:'Operator cannot send replies'};
  if (!conversation || (operator.role==='agent' && conversation.assigned_to !== operator.user_id)) return {status:404,error:'Conversation not found'};
  if (!config?.enabled) return {status:503,error:'WhatsApp sending is disabled'};
  if (!/^[0-9]{10,30}$/.test(config.phoneNumberId ?? '') || !config.token || config.token.length < 30) return {status:503,error:'Sending credentials are not configured'};
  if (!PHONE.test(recipient ?? '') || !PHONE.test(config.allowRecipient ?? '') || recipient !== config.allowRecipient) return {status:403,error:'Recipient is not on the staging test allowlist'};
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_REPLY) return {status:400,error:'Reply must contain 1–4096 characters'};
  if (!UUID.test(requestId ?? '')) return {status:400,error:'Valid request id is required'};
  const time = new Date(lastInboundAt ?? '').getTime();
  if (!Number.isFinite(time) || time > now + 60_000 || now - time >= WINDOW_MS || now < time) return {status:403,error:'Customer service window is closed'};
  return {ok:true,text:text.trim(),recipient,requestId};
}

export async function sendGraphText({phoneNumberId,recipient,text,token,fetchImpl=fetch,timeoutMs=10000}) {
  if (!/^[0-9]{10,30}$/.test(phoneNumberId) || !PHONE.test(recipient)) throw new Error('Invalid Meta addressing');
  if (typeof token !== 'string' || !token || !text || text.length > MAX_REPLY) throw new Error('Invalid outbound request');
  const abort = new AbortController();
  const timer = setTimeout(()=>abort.abort(),timeoutMs);
  try {
    const res = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,
        type:'text',text:{preview_url:false,body:text}}),signal:abort.signal});
    if (!res.ok) return {accepted:false,httpStatus:res.status};
    const data = await res.json();
    const id = data?.messages?.[0]?.id;
    if (typeof id !== 'string' || !/^wamid\.[-\w=.]{5,250}$/.test(id)) throw new Error('Meta response lacks a valid message identifier');
    return {accepted:true,messageId:id};
  } finally {clearTimeout(timer)}
}

/** Durable claim before provider call; never retry automatically after an ambiguous response. */
export async function executeRestrictedReply({input,claim,send,record,markFailure}) {
  if (!input?.ok) return input;
  const claimed = await claim(input);
  if (!claimed) return {status:409,error:'Duplicate request id'};
  let result;
  try {result = await send(input)}
  catch {await markFailure(input.requestId,'unknown').catch(()=>{});return {status:502,error:'Provider response uncertain; check delivery before retrying'};}
  if (!result.accepted) {
    await markFailure(input.requestId,'rejected').catch(()=>{});
    return {status:502,error:'Provider rejected the message'};
  }
  try {await record(input,result.messageId)}
  catch {await markFailure(input.requestId,'persist_failed').catch(()=>{});return {status:202,warning:'Meta accepted the message but Inbox recording needs investigation'};}
  return {status:200,ok:true,messageId:result.messageId};
}