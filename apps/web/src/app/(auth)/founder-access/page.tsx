import {FounderLoginForm} from "@/components/founder-login-form";
import {founderLogin,requestPasswordReset} from "../actions";

export const metadata={title:"Founder sign in"};

export default async function FounderAccessPage({searchParams}:{searchParams:Promise<{next?:string;password?:string}>}){
  const {next,password}=await searchParams;
  const notice=password==="updated"?"Founder password updated successfully. Sign in with the new password, then complete authenticator verification.":undefined;
  return <FounderLoginForm action={founderLogin} resetAction={requestPasswordReset} next={next} notice={notice} captchaSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}/>;
}
