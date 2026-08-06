import type { SupabaseClient } from "@supabase/supabase-js";

export async function rateLimited(supabase:SupabaseClient,organisationId:string,bucket:string,maxRequests:number,windowSeconds:number){
  const {data,error}=await supabase.rpc("consume_rate_limit",{target_organisation:organisationId,target_bucket:bucket,max_requests:maxRequests,window_seconds:windowSeconds});
  return Boolean(error||data!==true);
}
