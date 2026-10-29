// Durable queue claiming, processing and retry state all live inside PostgreSQL transactions.
export async function processBatch(gateway,{batchSize=10,maxAttempts=5}={}) {
  if(!gateway) throw new Error('Database not configured');
  const claims=await gateway.rpc('fsp_claim_events',{p_limit:batchSize,p_lease_seconds:60});
  const results=[];
  for(const event of claims ?? []) {
    try {
      const status=await gateway.rpc('fsp_process_event',{
        p_id:event.id,p_lease:event.lease_token,p_max_attempts:maxAttempts});
      results.push({id:event.id,status});
    } catch (error) {
      // A lease safely expires if DB call fails; never acknowledge processing success.
      results.push({id:event.id,status:'upstream_error'});
    }
  }
  return results;
}