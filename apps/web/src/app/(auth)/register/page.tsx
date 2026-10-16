import type {Metadata} from "next";
import {AuthForm} from "@/components/auth-form";
import {register,requestPasswordReset,resendVerification} from "../actions";

export const metadata:Metadata={title:"Register your organisation"};

export default async function RegisterPage({searchParams}:{searchParams:Promise<{next?:string}>}){
  const {next}=await searchParams;
  return <AuthForm mode="register" action={register} resendAction={resendVerification} resetAction={requestPasswordReset} next={next} captchaSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}/>;
}
