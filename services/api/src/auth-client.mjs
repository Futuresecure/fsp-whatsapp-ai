// Browser-facing client wrapper; use publishable key ONLY. Keep privileged keys on the API server.
// Install and version-pin @supabase/supabase-js when connecting this to the accepted UI.
export function createOperatorAuthClient(supabase) {
  return {
    login: (email,password)=>supabase.auth.signInWithPassword({email,password}),
    logout: ()=>supabase.auth.signOut(),
    resetPassword: (email,redirectTo)=>supabase.auth.resetPasswordForEmail(email,{redirectTo}),
    currentSession: ()=>supabase.auth.getSession(),
    // Token must be revalidated by API; an in-browser session alone grants no operator permission.
    api:async(path,opts={})=>{
      const {data,error}=await supabase.auth.getSession();
      if(error||!data.session?.access_token)throw new Error('Sign in required');
      const resp=await fetch(path,{...opts,headers:{...opts.headers,Authorization:'Bearer '+data.session.access_token}});
      if(resp.status===401)throw new Error('Session expired');
      if(resp.status===403)throw new Error('Operator access denied');
      if(!resp.ok)throw new Error('Request unsuccessful');
      return resp.json();
    }
  };
}