import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { projectHomePath } from "@/lib/role-experience";
import { switchInvitationAccount } from "./actions";
import {z} from "zod";

export default async function InvitePage({params}:{params:Promise<{token:string}>}){
  const {token}=await params;
  const destination=`/invite/${token}`;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();

  if(!user)redirect(`/login?next=${encodeURIComponent(destination)}`);

  const {data:accepted,error}=await supabase.rpc("accept_workspace_invitation",{raw_token:token});
  if(error){
    const switchAccount=switchInvitationAccount.bind(null,token);
    return <main className="grid min-h-screen place-items-center bg-[#f5f7f9] p-6">
      <div className="ev-card w-full max-w-lg p-8 text-center sm:p-10">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Secure workspace invitation</p>
        <h1 className="mt-3 text-2xl font-semibold text-[#10243e]">Use the invited account</h1>
        <p className="mt-3 text-sm leading-6 text-[#65736f]">You are currently signed in as <strong className="text-[#10243e]">{user.email}</strong>, but this invitation cannot be accepted by that account.</p>
        <p className="mt-3 text-sm leading-6 text-[#65736f]">Switch accounts and sign in with the exact email address that received the invitation. If the link has expired or was already used, ask the Organisation Administrator or Project Manager for a new invitation.</p>
        <form action={switchAccount} className="mt-6">
          <button className="ev-button w-full">Sign out and use invited email</button>
        </form>
        <Link href="/app" className="mt-4 inline-block text-sm font-bold text-[#607084] hover:text-[#e8733f]">Return to current workspace</Link>
      </div>
    </main>;
  }
  const result=z.discriminatedUnion("kind",[z.object({kind:z.literal("executive"),organisation_id:z.uuid()}),z.object({kind:z.literal("project"),project_id:z.uuid()})]).safeParse(accepted);
  if(!result.success)throw new Error("Invitation access could not be verified. Please retry.");
  if(result.data.kind==="executive")redirect(`/app/${result.data.organisation_id}/executive`);
  const acceptedProjectId=result.data.project_id;
  const {data:access}=await supabase.from("project_access").select("organisation_id,project_id,role").eq("project_id",acceptedProjectId).maybeSingle();
  redirect(access?projectHomePath(access.organisation_id,access.project_id,String(access.role)):"/app");
}
