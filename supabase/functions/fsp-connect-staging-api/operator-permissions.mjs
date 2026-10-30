/** FSP Connect 2.1 restricted operator access policy.
 * No Meta operations, database writes, user metadata claims, or user-provided role escalation.
 * Authoritative operator roles always come from fsp_operators via the staging backend.
 */
const STAFF_ROLES=new Set(['admin','manager','agent','viewer']);
const EDIT_ACTIONS=new Set(['mark_read','auto_mark_read','resolve','reopen','takeover','pause_ai','note','reply']);
export function isActiveOperator(operator){
 return Boolean(operator&&operator.active===true &&
  typeof operator.user_id==='string'&&operator.user_id.length>0 &&
  STAFF_ROLES.has(operator.role));
}
export function hasWorkspaceAccess(operator){
 return isActiveOperator(operator)&&['admin','manager'].includes(operator.role);
}
export function canViewConversation(operator,conversation){
 if(!isActiveOperator(operator)||!conversation||typeof conversation!=='object')return false;
 if(hasWorkspaceAccess(operator))return true;
 return typeof conversation.assigned_to==='string'&&conversation.assigned_to===operator.user_id;
}
export function canPerformConversationAction(operator,conversation,action){
 if(!canViewConversation(operator,conversation))return false;
 if(action==='assign')return hasWorkspaceAccess(operator);
 if(!EDIT_ACTIONS.has(action))return false;
 return operator.role!=='viewer';
}
export function visibleConversationScope(operator){
 if(!isActiveOperator(operator))return null;
 return hasWorkspaceAccess(operator)?'':'&assigned_to=eq.'+encodeURIComponent(operator.user_id);
}
export function canInspectAdminSettings(operator){
 return isActiveOperator(operator)&&operator.role==='admin';
}
