import { AuthForm } from "@/components/auth-form"; import { login,resendVerification } from "../actions";
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string;access?:string}>}){const {next,access}=await searchParams;return <AuthForm mode="login" action={login} resendAction={resendVerification} next={next} accessDenied={access==="required"}/>}
