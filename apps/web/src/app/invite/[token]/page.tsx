import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function InvitePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params; const {supabase}=await requireUser();
  const {error}=await supabase.rpc("accept_project_invitation",{raw_token:token});
  if(error)return <main className="grid min-h-screen place-items-center p-6"><div className="ev-card max-w-md p-8 text-center"><h1 className="text-2xl font-semibold">Invitation unavailable</h1><p className="mt-3 text-[#65736f]">It may be expired, already used, or addressed to a different signed-in email.</p></div></main>;
  redirect("/app");
}
