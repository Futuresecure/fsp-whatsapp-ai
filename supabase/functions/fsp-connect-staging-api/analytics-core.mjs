/** Aggregate analytics guard. Prevents raw database/PII values from reaching a browser. */
const KEYS=['conversations','contacts','messages','inbound','outbound','sent','delivered','read','failed'];
function count(value){return Number.isSafeInteger(value)&&value>=0?value:null;}
export function sanitizeAnalytics(input){
 if(input?.ok!==true||!Array.isArray(input.daily))return {ok:false,error:'Analytics unavailable'};
 const days=Number.isSafeInteger(input.days)&&input.days>=1&&input.days<=90?input.days:null;
 if(!days||input.daily.length!==days)return {ok:false,error:'Invalid report window'};
 const totals={};for(const k of KEYS){totals[k]=count(input[k]);if(totals[k]===null)return {ok:false,error:'Invalid analytics totals'};}
 const rows=input.daily.map(entry=>{
  if(!entry||typeof entry.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(entry.day))return null;
  const messages=count(entry.messages),inbound=count(entry.inbound),outbound=count(entry.outbound);
  if([messages,inbound,outbound].some(n=>n===null)||inbound+outbound!==messages)return null;
  return {day:entry.day,messages,inbound,outbound};
 });
 if(rows.some(x=>!x))return {ok:false,error:'Invalid analytics daily data'};
 return {ok:true,scope:input.scope==='assigned'?'assigned':'workspace',days,
  totals,daily:rows,generated_at:typeof input.generated_at==='string'?input.generated_at:null,
  note:'Provider status counts are current outcomes, not cumulative sent-to-read conversions.'};
}
