import { createSupabaseGateway } from './supabase.mjs';
import { processBatch } from './worker.mjs';
const gateway=createSupabaseGateway({url:process.env.SUPABASE_URL,
 secretKey:process.env.SUPABASE_SECRET_KEY,publishableKey:process.env.SUPABASE_PUBLISHABLE_KEY});
if(!gateway)throw new Error('Supabase environment is incomplete');
const once=process.argv.includes('--once');
do {
  const results=await processBatch(gateway);
  console.log(JSON.stringify({processed:results.length,complete:results.filter(r=>r.status==='completed').length,
    retried:results.filter(r=>r.status==='retry').length}));
  if(once)break;
  await new Promise(r=>setTimeout(r,5000));
} while(true);