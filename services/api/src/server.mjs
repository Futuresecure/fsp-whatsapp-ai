import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_WEBHOOK_BYTES = 512 * 1024;

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody, signature, appSecret) {
  if (!appSecret || !/^sha256=[a-f0-9]{64}$/i.test(signature ?? '')) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const submitted = String(signature).slice('sha256='.length).toLowerCase();
  return constantTimeEqual(expected, submitted);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_WEBHOOK_BYTES) {
      const error = new Error('body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function reply(res, code, message, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(message);
}

export function createAppServer({ verifyToken, appSecret } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return reply(res, 200, JSON.stringify({ ok: true, mode: 'foundation-only' }), 'application/json');
    }
    if (req.method === 'GET' && url.pathname === '/readyz') {
      return reply(res, 503, JSON.stringify({ ready: false, reason: 'durable processing not configured' }), 'application/json');
    }
    if (url.pathname !== '/webhooks/whatsapp') return reply(res, 404, 'Not found');

    if (req.method === 'GET') {
      const authorized = verifyToken &&
        url.searchParams.get('hub.mode') === 'subscribe' &&
        constantTimeEqual(url.searchParams.get('hub.verify_token') ?? '', verifyToken);
      const challenge = url.searchParams.get('hub.challenge');
      if (!authorized || !challenge || challenge.length > 4096) return reply(res, 403, 'Forbidden');
      return reply(res, 200, challenge);
    }
    if (req.method !== 'POST') return reply(res, 405, 'Method not allowed');

    try {
      const rawBody = await readBody(req);
      if (!verifyWebhookSignature(rawBody, req.headers['x-hub-signature-256'], appSecret)) {
        return reply(res, 403, 'Invalid signature');
      }
      // Fail closed until transactional inbox, idempotency and durable processing exist.
      // Acknowledging signed events prematurely could lose customer messages.
      return reply(res, 503, 'Webhook receiver not yet enabled');
    } catch (error) {
      return reply(res, error.statusCode === 413 ? 413 : 400, 'Invalid webhook request');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const host = '127.0.0.1';
  const port = Number(process.env.PORT ?? '8787');
  const server = createAppServer({
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
  });
  server.listen(port, host, () => {
    console.log('FSP Connect 2.1 foundation listening on http://' + host + ':' + port + ' (NO LIVE SEND)');
  });
}
