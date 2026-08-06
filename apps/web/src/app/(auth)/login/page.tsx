import { AuthForm } from "@/components/auth-form"; import { login } from "../actions";
export default async function LoginPage({searchParams}:{searchParams:Promise<{next?:string}>}){const {next}=await searchParams;return <AuthForm mode="login" action={login} next={next}/>}
