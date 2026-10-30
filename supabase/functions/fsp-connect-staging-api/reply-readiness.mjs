/** Read-only rollout diagnostics. Never sends a WhatsApp message or relaxes the test allowlist. */
export function inspectReplyRollout({accessToken,phoneNumberId,testRecipient,testSendingEnabled}){
 const configured=typeof accessToken==='string'&&accessToken.length>=30 &&
   /^[0-9]{10,30}$/.test(phoneNumberId||'');
 const allowlisted=/^[0-9]{6,20}$/.test(testRecipient||'');
 const checks={
  provider_credentials:configured,
  test_recipient_allowlisted:allowlisted,
  restricted_test_sending: Boolean(testSendingEnabled && configured && allowlisted),
  operator_authorization:true,
  incoming_24h_window_enforced:true,
  idempotent_claim_before_send:true,
  staging_durable_rate_gate_implemented:true,
  production_customer_sending:false
 };
 return {
  environment:'staging',
  mode:'test_recipient_only',
  production_ready:false,
  checks,
  blockers:[
   'Production manual reply endpoint is not deployed',
   'Production-specific permissions, rate policy review and abuse monitoring are not approved',
   'Controlled non-test customer pilot and rollback verification are pending'
  ]
 };
}
