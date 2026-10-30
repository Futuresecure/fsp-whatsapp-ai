/** Only sanitizes private FSP relational preflight metadata.
 * This function NEVER certifies the existence of a backup or a successful independent restore.
 */
const FIELDS=['contacts','conversations','messages','outbound_requests'];
const ORPHANS=['orphan_messages','orphan_conversations','orphan_reply_requests','orphan_rate_reservations'];
function safeInteger(n){return Number.isSafeInteger(n)&&n>=0?n:null;}
export function summarizeRecoveryPreflight(data){
 const object=data && typeof data==='object'&&!Array.isArray(data)?data:{};
 const counts={};
 const integrity={};
 for(const k of FIELDS)counts[k]=safeInteger(object[k]);
 for(const k of ORPHANS)integrity[k]=safeInteger(object[k]);
 const validCounts=FIELDS.every(k=>counts[k]!==null);
 const validIntegrity=ORPHANS.every(k=>integrity[k]!==null);
 const integrityStatus=!validCounts||!validIntegrity?'unverified':
  ORPHANS.some(k=>integrity[k]>0)?'blocked':'pass';
 return {
  scope:'standalone_fsp_connect',
  assessment:'database_relationship_preflight_only',
  relational_integrity:integrityStatus,
  counts,orphan_checks:integrity,
  backup_artifact_verified:false,
  independent_restore_verified:false,
  external_backup_status:'unverified',
  production_recovery_ready:false,
  limitations:[
   'Database row counts are not backups.',
   'An in-database synthetic transaction rehearsal is not an independent disaster recovery test.',
   'A full off-site encrypted backup and isolated restore must be verified separately.'
  ]
 };
}
