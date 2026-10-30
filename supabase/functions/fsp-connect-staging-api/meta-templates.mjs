/** Read-only Meta Business template discovery. Cannot create, approve or send messages. */
const STATES=new Set(['APPROVED','PENDING','REJECTED','PAUSED','DISABLED','ARCHIVED','DELETED','IN_APPEAL','PENDING_DELETION','LIMIT_EXCEEDED']);
const CATEGORIES=new Set(['MARKETING','UTILITY','AUTHENTICATION']);
export function sanitizeMetaTemplates(payload){
 const data=Array.isArray(payload?.data)?payload.data:[];
 const templates=data.slice(0,100).filter(v=>v&&typeof v==='object').map(item=>{
  const status=typeof item.status==='string'&&STATES.has(item.status.toUpperCase())?item.status.toUpperCase():'UNKNOWN';
  const category=typeof item.category==='string'&&CATEGORIES.has(item.category.toUpperCase())?item.category.toUpperCase():'UNKNOWN';
  const components=Array.isArray(item.components)?item.components:[];
  const body=components.find(x=>x?.type==='BODY'&&typeof x.text==='string')?.text||'';
  return {
   id:typeof item.id==='string'&&/^\d{1,24}$/.test(item.id)?item.id:null,
   name:typeof item.name==='string'&&/^[a-z0-9_]{1,512}$/.test(item.name)?item.name:'Unknown template',
   language:typeof item.language==='string'&&/^[a-zA-Z_-]{2,16}$/.test(item.language)?item.language:'unknown',
   status,category,body_preview:body.slice(0,1500),
   is_meta_approved:status==='APPROVED'
  };
 });
 return {mode:'read_only',provider:'Meta',connected:true,templates,
  truncated:Boolean(payload?.paging?.next),
  approval_is_provider_verified:true,sending_enabled:false};
}
export async function retrieveMetaTemplates({wabaId,token,fetcher=fetch}={}){
 if(typeof wabaId!=='string'||!/^\d{8,25}$/.test(wabaId)||
    typeof token!=='string'||token.length<30)
  return {mode:'read_only',provider:'Meta',connected:false,templates:[],
   error:'Meta WABA credentials not configured',sending_enabled:false};
 const params=new URLSearchParams({
  fields:'id,name,language,category,status,components',limit:'100'
 });
 try{
  const url='https://graph.facebook.com/v26.0/'+wabaId+'/message_templates?'+params.toString();
  const response=await fetcher(url,{
   method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)return {mode:'read_only',provider:'Meta',connected:false,templates:[],
   error:'Meta template lookup failed ('+response.status+')',sending_enabled:false};
  const data=await response.json();
  return sanitizeMetaTemplates(data);
 }catch{
  return {mode:'read_only',provider:'Meta',connected:false,templates:[],
   error:'Meta template lookup unavailable',sending_enabled:false};
 }
}
