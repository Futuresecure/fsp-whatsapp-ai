import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalizeMetaEvents } from './events.mjs';
import { createSupabaseGateway } from './supabase.mjs';
import { handleOperatorRequest } from './operator.mjs';

const MAX_WEBHOOK_BYTES = 512 * 1024;
function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function verifyWebhookSignature(rawBody, signature, appSecret) {
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? '')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return constantTimeEqual(expected, String(signature).slice(7).toLowerCase());
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_WEBHOOK_BYTES) { const err = new Error('body too large'); err.statusCode = 413; throw err; }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function reply(res, code, message, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(message);
}
export function createAppServer({ verifyToken, appSecret, gateway = null } = {}) {
  return http.createServer(async (req,res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz')
      return reply(res,200,JSON.stringify({ok:true,mode:'staging-ready-code-no-live-send'}),'application/json');
    if (req.method === 'GET' && url.pathname === '/readyz') {
      if (!gateway || !verifyToken || !appSecret) return reply(res,503,JSON.stringify({ready:false,reason:'missing configuration'}),'application/json');
      try {
        await gateway.table('fsp_webhook_events','?select=id&limit=1');
        return reply(res,200,JSON.stringify({ready:true,mode:'inbound-only'}),'application/json');
      } catch { return reply(res,503,JSON.stringify({ready:false,reason:'database unreachable'}),'application/json'); }
    }
    if (url.pathname.startsWith('/api/')) {
      if(await handleOperatorRequest(req,res,url,gateway))return;
      return reply(res,404,'Not found');
    }
    if (url.pathname !== '/webhooks/whatsapp') return reply(res,404,'Not found');
    if (req.method === 'GET') {
      const authorized = verifyToken && url.searchParams.get('hub.mode') === 'subscribe' &&
        constantTimeEqual(url.searchParams.get('hub.verify_token') ?? '',verifyToken);
      const challenge = url.searchParams.get('hub.challenge');
      if (!authorized || !challenge || challenge.length > 4096) return reply(res,403,'Forbidden');
      return reply(res,200,challenge);
    }
    if (req.method !== 'POST') return reply(res,405,'Method not allowed');
    try {
      const rawBody=await readBody(req);
      if(!verifyWebhookSignature(rawBody,req.headers['x-hub-signature-256'],appSecret))
        return reply(res,403,'Invalid signature');
      if(!gateway) return reply(res,503,'Durable storage unavailable');
      let events;
      try {events=normalizeMetaEvents(JSON.parse(rawBody.toString('utf8')));}
      catch {return reply(res,400,'Invalid webhook payload');}
      // One PostgreSQL RPC = one durable transaction. Failure returns 503 so Meta retries.
      if(events.length)await gateway.rpc('fsp_enqueue_events',{p_events:events});
      return reply(res,200,'EVENT_RECEIVED');
    }catch(error){
      return reply(res,error.statusCode===413?413:503,'Webhook request not accepted');
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db=createSupabaseGateway({url:process.env.SUPABASE_URL,
    secretKey:process.env.SUPABASE_SECRET_KEY,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY});
  const host=process.env.API_BIND_HOST??'127.0.0.1';
  const port=Number(process.env.PORT??'8787');
  createAppServer({verifyToken:process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret:process.env.META_APP_SECRET,gateway:db}).listen(port,host,()=>{
      console.log('FSP Connect 2.1 inbound-only API; outbound/broadcast/AI/automation disabled');
    });
}