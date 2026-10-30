/** FSP Connect retention inventory — server-only summary sanitization.
 * No record-level metadata, contact details or deletion operation can pass to the client.
 */
export const RETENTION_CATEGORIES=Object.freeze({
 contacts:'Contacts',
 conversations:'Conversations',
 messages:'Messages',
 webhook_events:'Webhook Events',
 reply_requests:'Reply Requests',
 operator_audit:'Operator Audit Events',
 message_status_events:'Message Status Events',
 reply_rate_reservations:'Reply Rate Reservations',
 operational_alerts:'Operational Alerts'
});
const FIELDS=['total','older_30_days','older_90_days','older_365_days'];
function safeCount(n){return Number.isSafeInteger(n)&&n>=0?n:null;}
export function summarizeRetentionInventory(input){
 const rows=Array.isArray(input?.categories)?input.categories:[];
 const entries=[];
 const known=new Set();
 for(const row of rows){
  const type=row?.category;
  if(typeof type!=='string'||!Object.hasOwn(RETENTION_CATEGORIES,type)||known.has(type))continue;
  known.add(type);
  const counts={};
  for(const key of FIELDS)counts[key]=safeCount(row[key]);
  // A corrupt count (older > total, 365-day > 90-day) must not appear healthy.
  const valid=FIELDS.every(k=>counts[k]!==null) &&
    counts.older_365_days<=counts.older_90_days &&
    counts.older_90_days<=counts.older_30_days &&
    counts.older_30_days<=counts.total;
  entries.push({
   id:type,label:RETENTION_CATEGORIES[type],
   ...Object.fromEntries(FIELDS.map(k=>[k,valid?counts[k]:null])),
   status:valid?'verified_count':'unverified'
  });
 }
 entries.sort((a,b)=>a.label.localeCompare(b.label));
 const inventoryComplete=known.size===Object.keys(RETENTION_CATEGORIES).length &&
   entries.every(e=>e.status==='verified_count');
 return {
  scope:'standalone_fsp_connect',
  age_buckets_days:[30,90,365],
  inventory_complete:inventoryComplete,
  categories:entries,
  retention_policy_approved:false,
  automatic_deletion_enabled:false,
  legal_hold_review_complete:false,
  backup_retention_review_complete:false,
  production_privacy_ready:false,
  purpose:'Read-only age buckets, not a deletion schedule.',
  requires_policy_decision:true
 };
}
