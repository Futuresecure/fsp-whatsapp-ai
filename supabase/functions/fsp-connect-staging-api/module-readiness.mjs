/** Read-only module rollout state. Database draft counts DO NOT imply production enablement. */
function count(v){return Number.isSafeInteger(v)&&v>=0?v:null;}
export function summarizeModuleReadiness(raw={}){
 const metrics={
  ai_settings:count(raw.aiSettings),ai_configs_enabled:count(raw.aiConfigsEnabled),
  flow_drafts:count(raw.flowDrafts),active_flow_records:count(raw.activeFlows),
  opted_in_contacts:count(raw.optedInContacts),all_contacts:count(raw.allContacts)
 };
 return {
  environment:'staging',sending_enabled:false,
  ai_assistant:{configurations:metrics.ai_settings,enabled_records:metrics.ai_configs_enabled,
   model_connected:false,knowledge_base_verified:false,suggestion_engine_enabled:false,
   auto_reply_enabled:false,ready:false},
  automation:{saved_flows:metrics.flow_drafts,active_database_records:metrics.active_flow_records,
   execution_engine_enabled:false,automatic_customer_messages:false,ready:false},
  broadcast:{contacts:metrics.all_contacts,recorded_opt_in_contacts:metrics.opted_in_contacts,
   approved_template_gate_verified:false,bulk_sender_enabled:false,scheduled_sender_enabled:false,
   opt_out_enforced_for_future_sends:true,ready:false},
  note:'Database records, metadata and staging configuration do not authorize customer sending.'
 };
}
