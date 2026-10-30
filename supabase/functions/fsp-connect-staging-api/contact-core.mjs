/** FSP Connect contact administration validation. No WhatsApp send path.
 * Only server-derived operator permission can invoke the mutations.
 */
const WA_ID=/^[1-9][0-9]{5,19}$/;
const NAME=/^[\p{L}\p{M}\p{N} .,'’()&\-]{1,100}$/u;
const LANGUAGES=new Set(['ta','en','ta-IN','en-IN']);
const PHONE_ID=/^[0-9]{6,20}$/;
export const ALLOWED_CONSENT_SOURCES=Object.freeze([
 'whatsapp_inbound_request','signed_paper','web_form','direct_request'
]);
function validateTags(tags){
 if(tags===undefined)return [];
 if(!Array.isArray(tags)||tags.length>12)return null;
 const output=[];
 for(const item of tags){
  if(typeof item!=='string')return null;
  const tag=item.trim();
  if(!/^[\p{L}\p{M}\p{N}_ \-]{1,32}$/u.test(tag))return null;
  if(!output.includes(tag))output.push(tag);
 }
 return output;
}
function normalizedName(name){
 if(name===null||name===undefined||name==='')return null;
 if(typeof name!=='string')return undefined;
 const trim=name.trim();
 return NAME.test(trim)?trim:undefined;
}
export function validateContact(body,{mode='create'}={}){
 if(!body||typeof body!=='object'||Array.isArray(body))return {ok:false,error:'Invalid contact'};
 const waId=body.wa_id;
 if(mode==='create'&&(!WA_ID.test(String(waId))||typeof waId!=='string'))
  return {ok:false,error:'Invalid international WhatsApp ID'};
 const displayName=normalizedName(body.display_name);
 if(displayName===undefined)return {ok:false,error:'Invalid name'};
 if(body.language_code!==undefined&&body.language_code!==null&&!LANGUAGES.has(body.language_code))
  return {ok:false,error:'Unsupported language'};
 const tags=validateTags(body.tags);
 if(tags===null)return {ok:false,error:'Invalid tags'};
 const result={display_name:displayName,language_code:body.language_code||null,tags,updated_at:new Date().toISOString()};
 if(mode==='create'){
  result.wa_id=waId;result.opted_in=false;result.source='manual';
  // No contact creation may opt in to marketing by supplying a bool.
 }
 return {ok:true,data:result};
}
export function validateBulkContacts(rows){
 if(!Array.isArray(rows)||rows.length<1||rows.length>100)
  return {ok:false,error:'Import needs 1 to 100 contacts'};
 const unique=new Set();
 const accepted=[];
 let skipped=0;
 for(const row of rows){
  const parsed=validateContact(row,{mode:'create'});
  if(!parsed.ok)return {ok:false,error:'Invalid row at position '+(accepted.length+skipped+1)+': '+parsed.error};
  if(unique.has(parsed.data.wa_id)){skipped++;continue}
  unique.add(parsed.data.wa_id);
  accepted.push(parsed.data);
 }
 return {ok:true,data:accepted,duplicates_in_file:skipped};
}
export function validateConsentEvidence(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||
    !ALLOWED_CONSENT_SOURCES.includes(body.source)||
    typeof body.proof_ref!=='string')
  return {ok:false,error:'Consent source and evidence reference required'};
 const ref=body.proof_ref.trim();
 if(ref.length<6||ref.length>160||/[<>\n\r]/.test(ref))
  return {ok:false,error:'Evidence reference must be 6–160 characters'};
 return {ok:true,source:body.source,proof_ref:ref};
}
export function allowContactMutation(op){
 return !!op&&op.active===true&&['admin','manager'].includes(op.role);
}
