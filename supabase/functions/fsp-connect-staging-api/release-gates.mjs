/**
 * FSP Connect 2.1 Production Release Gates.
 * READ ONLY. Never modifies a production flag, approves a sender, or issues a Meta request.
 * Security-sensitive/unverified controls are deliberately fail-closed.
 */
const MINUTE=60*1000;
function validCount(value){return Number.isSafeInteger(value)&&value>=0?value:null;}
function passWhen(condition){return condition===true?'pass':condition===false?'blocked':'unverified';}
function gate(id,title,status,detail,mandatory=true){
 return {id,title,status,detail,mandatory};
}
export function evaluateProductionReadiness({
 activeOperators=null,inboundMessages=null,
 queuedOrDeadWebhooks=null,openCriticalAlerts=null,
 monitorLastRun=null,stagingTestRecipientReady=false,
 databaseRateLimitReady=false,now=Date.now()
}={}){
 const ops=validCount(activeOperators),inbound=validCount(inboundMessages);
 const queue=validCount(queuedOrDeadWebhooks),critical=validCount(openCriticalAlerts);
 const monitorTime=typeof monitorLastRun==='string'?Date.parse(monitorLastRun):NaN;
 const monitorFresh=Number.isFinite(monitorTime)&&monitorTime<=now+MINUTE&&now-monitorTime<=15*MINUTE;
 const checks=[
  gate('active_operator','Active operator record',passWhen(ops===null?null:ops>0),
    'At least one currently active operator is required.'),
  gate('inbound_evidence','Incoming WhatsApp recorded',passWhen(inbound===null?null:inbound>0),
    'Historical inbound evidence only; does not prove a fresh customer test.'),
  gate('webhook_queue','Webhook backlog cleared',passWhen(queue===null?null:queue===0),
    'Queued, processing and dead webhook events must be zero at the snapshot.'),
  gate('monitor_heartbeat','Operational monitor fresh',passWhen(monitorFresh),
    'Last successful internal scan must be within 15 minutes.'),
  gate('critical_alerts','No critical operational alerts',passWhen(critical===null?null:critical===0),
    'Critical alerts must be investigated before any production pilot.'),
  gate('staging_allowlist','Staging test recipient restricted',passWhen(stagingTestRecipientReady===true),
    'Test recipient must remain explicitly allowlisted.'),
  gate('transactional_rate_gate','Reply rate-limit storage reachable',passWhen(databaseRateLimitReady===true),
    'This live check verifies the database ledger. Atomic admission behavior has separate automated QA.'),
  gate('multi_operator_qa','Independent multi-operator role tests','unverified',
    'Admin, manager, assigned agent, unassigned agent, and viewer require real-account QA.'),
  gate('restore_drill','Backup plus tested restore','unverified',
    'No verified full backup/restore drill has been recorded. Database counts are not a backup.'),
  gate('password_hardening','Password breach protection review','blocked',
    'Supabase Auth leaked-password protection was reported disabled; admin remediation required.'),
  gate('repo_visibility','Repository and credential exposure review','unverified',
    'Public repository visibility and historical secret risk require an approved privacy decision.'),
  gate('retention_policy','Data retention and deletion policy','unverified',
    'A documented WhatsApp data retention, erasure and recovery policy is required.'),
  gate('controlled_pilot','Approved non-test customer pilot','unverified',
    'Requires explicit owner authorization, privacy review and live evidence.'),
  gate('production_send_path','Controlled production sending endpoint','blocked',
    'No production customer reply endpoint is deployed or authorized.')
 ];
 const results={pass:0,blocked:0,unverified:0};
 for(const c of checks)results[c.status]++;
 return {
  environment:'staging',
  release:'FSP Connect 2.1',
  assessed_at:new Date(now).toISOString(),
  mode:'test_recipient_only',
  production_customer_sending:false,
  production_ready:false,
  can_enable_production:false,
  results,
  gates:checks,
  limitations:[
   'Release summary is read-only and cannot enable WhatsApp sending.',
   'Automatic gates report an observed snapshot; external approvals and restore tests require evidence.',
   'A clean alert queue does not guarantee that a future provider failure cannot occur.'
  ]
 };
}
