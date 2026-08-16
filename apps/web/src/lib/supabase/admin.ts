import "server-only";
import {createClient} from "@supabase/supabase-js";
import {z} from "zod";

const schema=z.object({url:z.url(),serviceRoleKey:z.string().min(40)});

export function createAdminClient(){
  const env=schema.parse({url:process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,serviceRoleKey:process.env.SUPABASE_SERVICE_ROLE_KEY});
  return createClient(env.url,env.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
