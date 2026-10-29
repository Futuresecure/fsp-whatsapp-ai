import test from 'node:test';
import assert from 'node:assert/strict';
import {configurationStatus, checkMetaConnection} from '../supabase/functions/fsp-connect-staging-api/meta-connection.mjs';
const config = {phoneNumberId: '1248446071686225', accessToken: 'EAA' + 's'.repeat(60), testRecipient: '919876543210', sendingEnabled: false};

 test('all readiness flags true with safe settings', () => {
  assert.deepEqual(configurationStatus(config), {phoneNumberIdConfigured: true, accessTokenConfigured: true,
    testRecipientConfigured: true, sendingEnabled: false, sendingTriggered: false});
 });
 test('missing test recipient fails its flag', () => {
  assert.equal(configurationStatus({...config, testRecipient: ''}).testRecipientConfigured, false);
 });
 test('invalid phone number id is rejected', () => {
  assert.equal(configurationStatus({...config, phoneNumberId: 'not-a-number'}).phoneNumberIdConfigured, false);
 });
 test('not configured skips external fetch', async () => {
  let called = false;
  const result = await checkMetaConnection({config: {...config, accessToken: ''}, fetchImpl: async () => {called = true;}});
  assert.equal(result.graphAccess, 'not_checked');assert.equal(called, false);
 });
 test('valid Meta read response verifies configured phone', async () => {
  let called = 0;
  const result = await checkMetaConnection({config, fetchImpl: async (url, opts) => {
    called++;assert.match(url, /^https:\/\/graph\.facebook\.com\/v26\.0\/1248446071686225\?fields=/);
    assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers.authorization, 'Bearer ' + config.accessToken);
    return {ok: true, json: async () => ({id: config.phoneNumberId, display_phone_number: '+91 93637 05905'})};
  }});
  assert.equal(called, 1);assert.equal(result.graphAccess, 'verified');assert.equal(result.senderSuffix, '••••5905');
  assert.equal(JSON.stringify(result).includes(config.accessToken),false);
  assert.equal(JSON.stringify(result).includes(config.testRecipient),false);
 });
 test('different phone ID never marks verification true', async () => {
  const result = await checkMetaConnection({config, fetchImpl: async()=>({ok:true,json:async()=>({id:'8888888888888'})})});
  assert.equal(result.graphAccess, 'mismatch');assert.equal(result.graphPhoneIdMatches,false);
 });
 test('permission failure returns a safe categorical result', async () => {
  const result = await checkMetaConnection({config, fetchImpl: async()=>({ok:false,status:403})});
  assert.equal(result.graphAccess, 'unauthorized_or_forbidden');assert.equal(result.graphHttpStatus,403);
 });
 test('Meta downtime does not leak third-party error details', async () => {
  const result = await checkMetaConnection({config, fetchImpl: async()=>{throw Error('Bearer '+config.accessToken)}});
  assert.equal(result.graphAccess,'connection_error');assert.equal(JSON.stringify(result).includes(config.accessToken),false);
 });
 test('sending configured flag remains informational; never sends', async () => {
  const result = await checkMetaConnection({config:{...config,sendingEnabled:true},fetchImpl:async(_,opts)=>{
    assert.equal(opts.method,'GET');return {ok:true,json:async()=>({id:config.phoneNumberId})};}});
  assert.equal(result.sendingEnabled,true);assert.equal(result.sendingTriggered,false);
 });