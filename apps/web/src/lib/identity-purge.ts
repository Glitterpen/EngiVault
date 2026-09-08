import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {deletedIdentityEmail,deletedIdentityPassword,validIdentityPurgeIds} from "@/lib/identity-purge-values";

type PurgeResult={claimed:number;completed:number;failed:number};

export async function processQueuedIdentityPurges(admin:SupabaseClient,userIds?:string[]):Promise<PurgeResult>{
  const requested=userIds?validIdentityPurgeIds(userIds):undefined;
  if(userIds&&!requested?.length)return {claimed:0,completed:0,failed:0};
  const {data,error}=await admin.rpc("claim_user_identity_purges",{target_user_ids:requested??null,batch_size:requested?.length??25});
  if(error)throw new Error(`Identity purge queue could not be claimed: ${error.code}`);
  const claimed=validIdentityPurgeIds((data??[]).map((row:{user_id?:unknown})=>row.user_id));
  // Explicit account deletions use irreversible Auth deletion, not just an
  // email/password change. Keep the old organisation-purge behaviour intact.
  const {data:retired,error:retiredError}=claimed.length
    ?await admin.from("retired_user_accounts").select("user_id").in("user_id",claimed)
    :{data:[],error:null};
  if(retiredError)throw new Error(`Account retirement status could not be checked: ${retiredError.code}`);
  const retiredIds=new Set(validIdentityPurgeIds((retired??[]).map((row:{user_id?:unknown})=>row.user_id)));
  let completed=0;let failed=0;
  for(const userId of claimed){
    let identityError:{code?:string}|null;
    try{({error:identityError}=retiredIds.has(userId)
      // Soft deletion is irreversible and clears credentials/identities while
      // retaining the UUID needed by document and audit foreign keys.
      ?await admin.auth.admin.deleteUser(userId,true)
      :await admin.auth.admin.updateUserById(userId,{
      email:deletedIdentityEmail(userId),
      password:deletedIdentityPassword(),
      ban_duration:"876000h",
      user_metadata:{account_state:"deleted",display_name:"Deleted user",deleted_at:new Date().toISOString()},
    }));}catch{identityError={code:"IDENTITY_SERVICE_UNAVAILABLE"};}
    const succeeded=!identityError||(retiredIds.has(userId)&&identityError.code==="user_not_found");
    const {error:finishError}=await admin.rpc("finish_user_identity_purge",{target_user:userId,succeeded,failure_code:identityError?.code??null});
    if(finishError)console.error("[identity-purge] Queue completion could not be recorded",{userId,reference:finishError.code});
    if(succeeded&&!finishError)completed+=1;else{failed+=1;console.error("[identity-purge] Identity purge has not completed",{userId,reference:finishError?.code??identityError?.code})}
  }
  return {claimed:claimed.length,completed,failed};
}
