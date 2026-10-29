import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createAppServer, verifyWebhookSignature } from '../src/server.mjs';

async function withServer(fn) {
  const server = createAppServer({ verifyToken: 'test-verification-token', appSecret: 'test-app-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}

test('liveness does not imply readiness', async () => withServer(async base => {
  assert.equal((await fetch(base + '/healthz')).status, 200);
  assert.equal((await fetch(base + '/readyz')).status, 503);
}));

test('webhook challenge requires valid token and mode', async () => withServer(async base => {
  const url = new URL(base + '/webhooks/whatsapp');
  url.searchParams.set('hub.mode','subscribe');
  url.searchParams.set('hub.verify_token','test-verification-token');
  url.searchParams.set('hub.challenge','challenge-123');
  const res = await fetch(url);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'challenge-123');
  url.searchParams.set('hub.verify_token','wrong');
  assert.equal((await fetch(url)).status, 403);
  url.searchParams.set('hub.verify_token','test-verification-token');
  url.searchParams.set('hub.mode','different');
  assert.equal((await fetch(url)).status, 403);
}));

test('unsigned or forged webhook requests are rejected', async () => withServer(async base => {
  const url = base + '/webhooks/whatsapp';
  assert.equal((await fetch(url, { method:'POST', body:'{}' })).status, 403);
  assert.equal((await fetch(url, { method:'POST', body:'{}',
    headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)} })).status, 403);
}));

test('raw HMAC verifies and signed POST fails closed without durable processing', async () => withServer(async base => {
  const body = Buffer.from('{"entry":[]}');
  const sig = 'sha256=' + createHmac('sha256', 'test-app-secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, sig, 'test-app-secret'), true);
  assert.equal(verifyWebhookSignature(Buffer.from('{}'), sig, 'test-app-secret'), false);
  assert.equal((await fetch(base + '/webhooks/whatsapp', {
    method:'POST',body,headers:{'x-hub-signature-256':sig}
  })).status, 503);
}));

test('unknown routes and unsupported methods fail closed', async () => withServer(async base => {
  assert.equal((await fetch(base+'/other')).status,404);
  assert.equal((await fetch(base+'/webhooks/whatsapp',{method:'PUT'})).status,405);
}));
