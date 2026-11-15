import {redirect} from "next/navigation";
import Link from "next/link";
import {OrganisationCreateForm} from "@/components/organisation-create-form";
import {requireAuthenticatedUser} from "@/lib/auth";

export default async function OrganisationSetupPage(){
  const {supabase,user}=await requireAuthenticatedUser();
  const {data:organisations}=await supabase.rpc("get_my_organisations");
  if(organisations?.length)redirect("/app");
  if(user.user_metadata?.onboarding_mode!=="organisation")redirect("/login?access=required");
  if(!user.email||!user.email_confirmed_at)return <div className="w-full max-w-lg">
    <h1 className="text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Verify your work email</h1>
    <p className="mt-2 text-sm leading-6 text-[#617083]">Open the verification link sent to your work email before setting up your organisation. If the message has not arrived, you can request another from the sign-in page.</p>
    <Link className="ev-button-secondary mt-5 inline-flex" href="/login?next=%2Forganisation%2Fsetup">Back to sign in</Link>
  </div>;
  return <div className="w-full max-w-lg">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Organisation owner setup</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Complete your organisation</h1>
    <p className="mt-2 text-sm leading-6 text-[#617083]">Add the company logo to create the private organisation workspace. Project staff join only through controlled invitations. A deleted organisation cannot be restored from this page because its memberships, assignments and email identities are removed.</p>
    <div className="mt-7"><OrganisationCreateForm initialName={String(user.user_metadata?.organisation_name??"")} initialSlug={String(user.user_metadata?.organisation_slug??"")}/></div>
  </div>;
}
