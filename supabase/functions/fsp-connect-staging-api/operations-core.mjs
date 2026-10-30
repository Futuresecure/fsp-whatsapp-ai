/** Sanitized, admin-only operational monitoring. Never passes PII or a secret through. */
export const ALERT_CATEGORIES=Object.freeze({
 reply_uncertain:'Provider reply result uncertain',
 reply_claim_stalled:'Reply request stalled',
 provider_failed:'Provider reported a failed message',
 outbound_status_pending:'Outgoing status pending too long',
 webhook_dead:'Webhook processing failed permanently',
 webhook_stalled:'Webhook processing delayed'
});
export function summarizeOperationalAlerts({rows=[],openCount=0,criticalCount=0,heartbeat=null,now=Date.now()}={}){
 const rawTime=heartbeat?.last_run_at||null;
 const parsed=rawTime?Date.parse(rawTime):NaN;
 const age=Number.isFinite(parsed)?Math.max(0,now-parsed):null;
 const fresh=age!==null && age<=15*60_000 && parsed<=now+60_000;
 const alerts=Array.isArray(rows)?rows.slice(0,25).filter(item=>Object.hasOwn(ALERT_CATEGORIES,item?.category)).map(item=>({
  category:item.category,
  label:ALERT_CATEGORIES[item.category],
  severity:item.severity==='critical'?'critical':'warning',
  first_seen_at:typeof item.first_seen_at==='string'?item.first_seen_at:null,
  last_seen_at:typeof item.last_seen_at==='string'?item.last_seen_at:null,
  occurrences:Number.isSafeInteger(item.occurrences)&&item.occurrences>=1?item.occurrences:1
 })):[];
 return {
  source:'internal-database-monitor',
  sending_enabled:false,
  external_notifications:false,
  monitor_fresh:fresh,
  monitor_last_run:rawTime,
  monitor_age_seconds:age===null?null:Math.floor(age/1000),
  open_count:Number.isSafeInteger(openCount)&&openCount>=0?openCount:alerts.length,
  critical_count:Number.isSafeInteger(criticalCount)&&criticalCount>=0?criticalCount:0,
  displayed_count:alerts.length,
  alerts
 };
}
