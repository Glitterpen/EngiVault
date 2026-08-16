import {redirect} from "next/navigation";
import {OrganisationCreateForm} from "@/components/organisation-create-form";
import {requireUser} from "@/lib/auth";

export default async function OrganisationSetupPage(){
  const {supabase,user}=await requireUser();
  const {data:organisations}=await supabase.rpc("get_my_organisations");
  if(organisations?.length)redirect("/app");
  if(user.user_metadata?.onboarding_mode!=="organisation")redirect("/login?access=required");
  return <div className="w-full max-w-lg">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Organisation owner setup</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Complete your organisation</h1>
    <p className="mt-2 text-sm leading-6 text-[#617083]">Add the company logo to create the private organisation workspace. Project Managers, Document Controllers and Discipline Engineers will join later through controlled invitations.</p>
    <div className="mt-7"><OrganisationCreateForm initialName={String(user.user_metadata?.organisation_name??"")} initialSlug={String(user.user_metadata?.organisation_slug??"")}/></div>
  </div>;
}
