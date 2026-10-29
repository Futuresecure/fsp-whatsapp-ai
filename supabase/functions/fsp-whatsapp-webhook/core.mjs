import { normalizeMetaEvents } from './events.mjs';

const encoder = new TextEncoder();
const MAX_BYTES = 512 * 1024;
const plain = (status, message) => new Response(message, { status, headers: {
  'content-type': 'text/plain; charset=utf-8', 'cache-control':'no-store',
  'x-content-type-options':'nosniff', 'referrer-policy':'no-referrer'
}});
const json = (status, data) => new Response(JSON.stringify(data), { status, headers: {
  'content-type':'application/json; charset=utf-8', 'cache-control':'no-store',
  'x-content-type-options':'nosniff'
}});

function safeCompare(a, b) {
  const left = encoder.encode(String(a ?? ''));
  const right = encoder.encode(String(b ?? ''));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for(let i=0;i<length;i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
export async function verifyMetaHmac(raw, signature, appSecret) {
  if (typeof appSecret !== 'string' || !appSecret || !/^sha256=[0-9a-f]{64}$/i.test(signature ?? '')) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC',key,raw));
  const sig = String(signature).slice(7).toLowerCase();
  const actual = Uint8Array.from(sig.match(/../g).map(x=>parseInt(x,16)));
  let diff=0;
  for(let i=0;i<mac.length;i++)diff|=mac[i]^actual[i];
  return diff===0;
}
async function readLimited(req, max=MAX_BYTES) {
  const advertised = req.headers.get('content-length');
  if (advertised && Number(advertised)>max) {const e=new Error('too large');e.status=413;throw e;}
  if (!req.body) return new Uint8Array();
  const reader=req.body.getReader();
  const chunks=[];let size=0;
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.byteLength;
      if(size>max){const e=new Error('too large');e.status=413;throw e;}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const raw=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
  return raw;
}

export function createWebhookHandler({config,enqueue}) {
  // config() is evaluated per invocation so newly configured secrets become available without shipping code.
  return async function webhook(req) {
    const u=new URL(req.url);
    const c=config();
    if(req.method==='GET' && u.searchParams.get('health')==='1')
      return json(200,{service:'fsp-whatsapp-webhook',status:c.ready?'ready':'not_configured',mode:'inbound-only',sending:false});
    if(!c.ready) return plain(503,'Webhook not configured');
    if(req.method==='GET') {
      const valid = u.searchParams.get('hub.mode')==='subscribe'
        && safeCompare(u.searchParams.get('hub.verify_token'),c.verifyToken);
      const challenge=u.searchParams.get('hub.challenge');
      if(!valid || !challenge || challenge.length>4096) return plain(403,'Forbidden');
      return plain(200,challenge);
    }
    if(req.method!=='POST')return plain(405,'Method not allowed');
    let body;
    try{body=await readLimited(req);}catch(e){return plain(e.status===413?413:400,'Webhook body rejected');}
    if(!await verifyMetaHmac(body,req.headers.get('x-hub-signature-256'),c.appSecret))
      return plain(403,'Invalid signature');
    let events;
    try{
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));
      if(c.wabaId && !data.entry.every(entry=>String(entry.id)===c.wabaId))return plain(403,'Unexpected account');
      if(c.phoneNumberId && !data.entry.every(entry=>entry.changes.every(change=>
          change.field!=='messages'||String(change.value?.metadata?.phone_number_id)===c.phoneNumberId)))
        return plain(403,'Unexpected phone number');
      events=normalizeMetaEvents(data);
    }catch{return plain(400,'Invalid webhook payload');}
    try{
      // Ack only after an atomic persisted transaction, never after a failed DB write.
      if(events.length) await enqueue(events);
      return plain(200,'EVENT_RECEIVED');
    }catch {return plain(503,'Storage unavailable');}
  };
}