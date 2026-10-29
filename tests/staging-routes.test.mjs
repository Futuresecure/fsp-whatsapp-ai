import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFspRoute } from '../supabase/functions/fsp-connect-staging-api/route.mjs';

const base = 'https://project.supabase.co/functions/v1/fsp-connect-staging-api';
const routed = route => base + '?route=' + encodeURIComponent(route);

test('root invocation resolves the operator identity endpoint', () => {
  const result = resolveFspRoute(routed('/api/me'));
  assert.equal(result.path, '/api/me');
  assert.equal(result.url.pathname, '/api/me');
});

test('query parameters remain scoped to the internal API route', () => {
  const result = resolveFspRoute(routed('/api/conversations?limit=50&offset=20'));
  assert.equal(result.path, '/api/conversations');
  assert.equal(result.url.searchParams.get('limit'), '50');
  assert.equal(result.url.searchParams.get('offset'), '20');
});

test('POST operator actions route remains unchanged', () => {
  assert.equal(resolveFspRoute(routed('/api/conversations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/actions')).path,
    '/api/conversations/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/actions');
});

test('public staging health route remains available', () => {
  assert.equal(resolveFspRoute(routed('/healthz')).path, '/healthz');
});

test('legacy nested Edge API invocation also normalizes', () => {
  assert.equal(resolveFspRoute(base + '/api/me').path, '/api/me');
  assert.equal(resolveFspRoute('https://internal.local/fsp-connect-staging-api/api/me').path, '/api/me');
});

test('invalid and external route selectors are rejected', () => {
  for (const route of ['https://example.com/api/me', '//other.com/api/me', '/config',
    '/api/../healthz', '/api/%2e%2e/healthz', '/api/me#fragment', '/api/me\\foo',
    '/api/me\nfoo', '/api/' + 'a'.repeat(1200)]) {
    assert.equal(resolveFspRoute(routed(route)), null, 'must reject '+JSON.stringify(route));
  }
});

test('no route selector preserves normal raw path for unsupported-route handling', () => {
  assert.equal(resolveFspRoute(base).path, '/');
  assert.equal(resolveFspRoute(base + '/random').path, '/random');
});
