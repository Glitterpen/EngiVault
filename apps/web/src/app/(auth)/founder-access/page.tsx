import {FounderLoginForm} from "@/components/founder-login-form";
import {founderLogin,requestPasswordReset} from "../actions";

export const metadata={title:"Founder sign in"};

export default async function FounderAccessPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const {next}=await searchParams;
  return <FounderLoginForm action={founderLogin} resetAction={requestPasswordReset} next={next}/>;
}
