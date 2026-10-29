/** FSP Connect Stage B. Public to Meta, but signed event delivery is mandatory. No outbound API. */
import {createWebhookHandler} from './core.mjs';

const projectUrl=(Deno.env.get('SUPABASE_URL')??'').replace(/\/$/,'');
const secretKeys=(()=>{try{return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')??'{}')}catch{return {}}})();
const secretKey=secretKeys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';

function configuration(){
  const verifyToken=Deno.env.get('FSP_META_VERIFY_TOKEN')??'';
  const appSecret=Deno.env.get('FSP_META_APP_SECRET')??'';
  return {
    ready:Boolean(projectUrl && secretKey && verifyToken && appSecret && verifyToken.length>=24),
    verifyToken,appSecret,
    wabaId:Deno.env.get('FSP_META_WABA_ID')??'',
    phoneNumberId:Deno.env.get('FSP_META_PHONE_NUMBER_ID')??''
  };
}

async function enqueue(events:unknown[]){
  const headers:Record<string,string>={apikey:secretKey,'content-type':'application/json','accept':'application/json'};
  if(!secretKey.startsWith('sb_secret_'))headers.authorization='Bearer '+secretKey;
  const r=await fetch(projectUrl+'/rest/v1/rpc/fsp_enqueue_events',{
    method:'POST',headers,body:JSON.stringify({p_events:events}),signal:AbortSignal.timeout(9000)
  });
  if(!r.ok)throw new Error('Cannot enqueue webhook events');
  const result=await r.json();
  if(typeof result!=='number'||result<0||result>events.length)throw new Error('Invalid storage confirmation');
  return result;
}

Deno.serve(createWebhookHandler({config:configuration,enqueue}));