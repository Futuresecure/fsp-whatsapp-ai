/** Aggregate-only operator readiness. No identities, contact data, or role modifications. */
export function summarizeOperatorCoverage(counts={}){
 const roles=['admin','manager','agent','viewer'];
 const active={};
 for(const role of roles){
  const n=counts[role];
  active[role]=Number.isSafeInteger(n)&&n>=0?n:null;
 }
 const complete=roles.every(role=>active[role]!==null);
 const total=complete?roles.reduce((sum,role)=>sum+active[role],0):null;
 const rolesRepresented=complete?roles.filter(role=>active[role]>0).length:null;
 return {
  environment:'staging',
  role_coverage:'source_operator_table',
  active_counts:active,
  total_active:total,
  represented_roles:rolesRepresented,
  roles_required:['admin','manager','assigned agent','unassigned agent','viewer'],
  simulated_role_matrix_complete:false,
  independent_login_sessions_verified:false,
  production_multioperator_ready:false,
  next_step:'Test each role with independently authenticated accounts and record access denial evidence.',
  can_modify_users:false
 };
}
