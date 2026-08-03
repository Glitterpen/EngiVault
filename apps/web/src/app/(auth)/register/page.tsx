import { AuthForm } from "@/components/auth-form"; import { register } from "../actions";
export default function RegisterPage(){return <AuthForm mode="register" action={register}/>}
