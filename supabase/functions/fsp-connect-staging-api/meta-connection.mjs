/** FSP Connect Stage B2: admin-only, read-only Meta configuration diagnostics. */
const PHONE_ID = /^[0-9]{10,30}$/;
const RECIPIENT = /^[0-9]{6,20}$/;
const GRAPH_VERSION = 'v26.0';

function maskedSuffix(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? '••••' + digits.slice(-4) : null;
}

export function configurationStatus(config) {
  const phoneNumberId = String(config?.phoneNumberId ?? '').trim();
  const accessToken = String(config?.accessToken ?? '');
  const testRecipient = String(config?.testRecipient ?? '').trim();
  return {
    phoneNumberIdConfigured: PHONE_ID.test(phoneNumberId),
    accessTokenConfigured: accessToken.length >= 30,
    testRecipientConfigured: RECIPIENT.test(testRecipient),
    sendingEnabled: config?.sendingEnabled === true,
    sendingTriggered: false,
  };
}

export async function checkMetaConnection({config, fetchImpl = fetch, timeoutMs = 8000}) {
  const status = configurationStatus(config);
  const result = { ...status, graphAccess: 'not_checked', graphPhoneIdMatches: null, senderSuffix: null };
  if (!status.phoneNumberIdConfigured || !status.accessTokenConfigured) return result;

  // GET only, and never follow redirects to untrusted destinations. This function cannot send a message.
  const phoneId = String(config.phoneNumberId).trim();
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}?fields=id,display_phone_number`;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'error',
      headers: { authorization: `Bearer ${config.accessToken}`, accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { ...result, graphAccess: response.status === 401 || response.status === 403 ? 'unauthorized_or_forbidden' : 'unavailable',
        graphHttpStatus: Number(response.status) || null };
    }
    const data = await response.json();
    const matches = String(data?.id ?? '') === phoneId;
    return { ...result, graphAccess: matches ? 'verified' : 'mismatch',
      graphPhoneIdMatches: matches, senderSuffix: matches ? maskedSuffix(data?.display_phone_number) : null };
  } catch {
    // Never include the token, recipient, URL or third-party response body in an error.
    return { ...result, graphAccess: 'connection_error' };
  }
}