import {FounderLoginForm} from "@/components/founder-login-form";
import {founderLogin,requestPasswordReset} from "../actions";

export const metadata={title:"Founder sign in"};

export default async function FounderAccessPage({searchParams}:{searchParams:Promise<{next?:string;password?:string;session?:string}>}){
  const {next,password,session}=await searchParams;
  const notice=session==="expired"?"You've been signed out due to inactivity. Please sign in again and complete authenticator verification.":password==="updated"?"Founder password updated successfully. Sign in with the new password, then complete authenticator verification.":undefined;
  return <FounderLoginForm action={founderLogin} resetAction={requestPasswordReset} next={next} notice={notice} captchaSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}/>;
}
