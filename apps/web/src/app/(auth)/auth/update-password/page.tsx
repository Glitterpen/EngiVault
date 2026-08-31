import Link from "next/link";
import {updatePassword} from "@/app/(auth)/actions";
import {PasswordUpdateForm} from "@/components/password-update-form";
import {FounderMfaGate} from "@/components/founder-mfa-gate";
import {safeAuthDestination} from "@/lib/auth-destination";
import {getFounderAccessStatus} from "@/lib/founder";
import {createClient} from "@/lib/supabase/server";

export default async function UpdatePasswordPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const {next}=await searchParams;
  const destination=safeAuthDestination(next);
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const founderAccess=user?await getFounderAccessStatus():null;
  const founderRecovery=founderAccess?.is_founder===true;
  const founderDisabled=founderRecovery&&founderAccess.access_status!=="active";
  const founderNeedsMfa=founderRecovery&&!founderDisabled&&!founderAccess.authorised;
  const loginBase=founderRecovery?"/founder-access":"/login";
  const loginHref=destination==="/app"?loginBase:`${loginBase}?next=${encodeURIComponent(destination)}`;
  const recoveryPath=`/auth/update-password?next=${encodeURIComponent(destination)}`;
  return <div className="w-full max-w-md">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Secure account recovery</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">{founderRecovery?"Recover founder access":"Set a new password"}</h1>
    {founderDisabled?<div className="mt-6 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-4 text-sm leading-6 text-[#8b3d1f]">This founder identity is not active. The password cannot be changed through self-service recovery.</div>:founderNeedsMfa?<div className="mt-7"><FounderMfaGate currentAal={founderAccess.current_aal} continueTo={recoveryPath} allowEnrollment={false} purpose="password-recovery"/></div>:user?<>
      <p className="mt-2 text-sm leading-6 text-[#617083]">{founderRecovery?"Authenticator verification is complete. Create a strong new founder password, then sign in again to open the control centre.":"Create a strong password for your organisation-controlled EngiCite account. After saving it, sign in and continue to the project invitation."}</p>
      <PasswordUpdateForm action={updatePassword} next={destination}/>
    </>:<>
      <div className="mt-6 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-4 text-sm leading-6 text-[#8b3d1f]">This password-reset session is unavailable or has expired. Request a fresh recovery email from the sign-in page.</div>
      <Link className="ev-button mt-5 w-full justify-center" href={loginHref}>Return to sign in</Link>
    </>}
  </div>;
}
