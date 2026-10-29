/**
 * FSP Connect 2.1 Staging route normalization.
 * Safely supports Supabase root-function invocation (?route=...) as well as
 * legacy nested paths. Does not bypass the handler's JWT/operator checks.
 */
const ORIGIN = 'https://internal.fsp.invalid';
const PREFIXES = ['/functions/v1/fsp-connect-staging-api', '/fsp-connect-staging-api'];

export function resolveFspRoute(requestUrl) {
  const incoming = new URL(requestUrl);
  const routed = incoming.searchParams.get('route');
  if (routed !== null) {
    if (routed.length > 1024 || /[\\#\u0000-\u001f]/.test(routed) ||
        !/^\/(?:api\/|healthz(?:\?|$))/.test(routed)) return null;
    let target;
    try { target = new URL(routed, ORIGIN); } catch { return null; }
    const rawPath = routed.split('?')[0];
    if (target.origin !== ORIGIN || target.pathname !== rawPath) return null;
    return { path: target.pathname, url: target };
  }
  let pathname = incoming.pathname;
  for (const prefix of PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      pathname = pathname.slice(prefix.length) || '/';
      break;
    }
  }
  return { path: pathname, url: incoming };
}
