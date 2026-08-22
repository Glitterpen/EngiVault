import { AuthForm } from "@/components/auth-form"; import { register,requestPasswordReset,resendVerification } from "../actions";
export default async function RegisterPage({searchParams}:{searchParams:Promise<{next?:string}>}){const {next}=await searchParams;return <AuthForm mode="register" action={register} resendAction={resendVerification} resetAction={requestPasswordReset} next={next}/>}
