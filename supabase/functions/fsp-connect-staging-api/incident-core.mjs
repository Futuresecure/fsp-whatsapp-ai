/** Internal incident-response preflight, no outbound notification and no side effects. */
const MINUTE=60_000;
const count=n=>Number.isSafeInteger(n)&&n>=0?n:null;
export function assessIncidentReadiness({
 monitorLastRun=null,openAlerts=null,criticalAlerts=null,
 webhookBacklog=null,now=Date.now()
}={}){
 const last=typeof monitorLastRun==='string'?Date.parse(monitorLastRun):NaN;
 const monitorFresh=Number.isFinite(last)&&last<=now+MINUTE&&now-last<=15*MINUTE;
 const open=count(openAlerts),critical=count(criticalAlerts),backlog=count(webhookBacklog);
 const metricsKnown=[open,critical,backlog].every(v=>v!==null);
 const urgent=!monitorFresh || !metricsKnown ||
  open>0 || critical>0 || backlog>0;
 return {
  environment:'staging',
  mode:'internal_only',
  assessment:urgent?'manual_attention_required':'no_current_incident_detected',
  monitoring_fresh:monitorFresh,
  open_alert_count:open,
  critical_alert_count:critical,
  queued_or_dead_webhooks:backlog,
  actions:[
   'Record incident UTC timestamp, owner, impact and affected feature.',
   'Investigate operational alert and recent webhook/reply audit WITHOUT exposing customer data.',
   'If duplicate or unsafe WhatsApp sending is suspected, disable only the standalone FSP sending flag using authorized project administration.',
   'Preserve message, status, operator and webhook evidence; never bulk-retry uncertain sends.',
   'Validate isolation and recovery, then record root cause and closure approval.'
  ],
  automatic_external_paging:false,
  incident_owner_assigned:false,
  live_response_drill_verified:false,
  production_incident_response_ready:false,
  can_send_messages:false,
  cannot_close_incidents_automatically:true
 };
}
