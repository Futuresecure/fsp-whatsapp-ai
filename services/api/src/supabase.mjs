export class UpstreamError extends Error { constructor(code,message){super(message);this.statusCode=code;} }
export function createSupabaseGateway({url,secretKey,publishableKey,fetchImpl=fetch}) {
  const root=String(url??'').replace(/\/$/,'');
  if(!/^https:\/\/[a-z0-9.-]+\.supabase\.co$/i.test(root) || !secretKey || !publishableKey) return null;
  const privilegedHeaders={'apikey':secretKey,'content-type':'application/json'};
  async function request(path,{method='GET',body,headers={},userToken=null}={}) {
    const response=await fetchImpl(root+path,{method,headers:{...(userToken?{'apikey':publishableKey,'authorization':'Bearer '+userToken}:privilegedHeaders),...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new UpstreamError(response.status,'Upstream request failed');
    if (response.status===204) return null;
    return response.json();
  }
  return {
    request,
    rpc:(name,args)=>request('/rest/v1/rpc/'+name,{method:'POST',body:args}),
    table:(name,search='',opts={})=>request('/rest/v1/'+name+search,opts),
    verifyUser:async token=>{
      if (!token || token.length>10000) return null;
      try {
        const u=await request('/auth/v1/user',{userToken:token});
        return u?.id && u?.is_anonymous!==true ? u : null;
      } catch (e) { if(e.statusCode===401||e.statusCode===403) return null; throw e; }
    }
  };
}