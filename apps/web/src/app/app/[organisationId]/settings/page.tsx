import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {OrganisationAdminForm} from "@/components/record-admin-forms";
import {organisationLogoEndpoint} from "@/lib/organisation-branding";

export default async function OrganisationSettings({params}:{params:Promise<{organisationId:string}>}){
 const {organisationId}=await params;
 const {supabase}=await requireUser();
 const {data:orgData}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
 const access=orgData as {organisation_id:string;name:string;slug:string;role:string}|null;
 if(!access||access.role!=="organisation_admin")notFound();
 const {data:branding}=await supabase.from("organisations").select("status,settings,updated_at").eq("id",organisationId).maybeSingle();
 const settings=branding?.settings&&typeof branding.settings==="object"&&!Array.isArray(branding.settings)?branding.settings as Record<string,unknown>:{};
 const logoVersion=typeof settings.logo_updated_at==="string"?settings.logo_updated_at:String(branding?.updated_at??"");
 const org={id:access.organisation_id,name:access.name,status:String(branding?.status??"active"),slug:access.slug,logoUrl:organisationLogoEndpoint(organisationId,logoVersion)};
 return <div className="mx-auto min-w-0 max-w-3xl">
  <Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> Organisation</Link>
  <p className="mt-4 text-xs font-bold uppercase tracking-[.16em] text-[#a84e25]">Organisation administrator</p>
  <h1 className="mt-2 flex min-w-0 flex-wrap items-center gap-2 break-words text-2xl font-semibold sm:text-3xl">Manage organisation</h1>

  <OrganisationAdminForm record={org}/>
  <section className="ev-card mt-6 p-5"><h2 className="mb-3 font-semibold">My email notifications</h2><Link className="ev-button-secondary" href={`/app/${organisationId}/settings/notifications`}>Choose disciplines and events</Link></section>
  <section className="ev-card mt-6 p-5"><h2 className="font-semibold">Executive access <HelpTip label="Executive Viewer role">Executive Viewers see organisation and project status without making changes. Only authorised Organisation Administrators can see and manage these viewers.</HelpTip></h2><Link className="ev-button-secondary" href={`/app/${organisationId}/settings/executives`}>Manage Executive Viewers</Link></section>
  <section className="ev-card mt-6 p-5"><h2 className="font-semibold">User account management <HelpTip label="Removed team accounts">Remove all project appointments before deleting a login account. Project documents and audit history are retained.</HelpTip></h2><Link className="ev-button-secondary" href={`/app/${organisationId}/settings/removed-accounts`}>Manage removed team accounts</Link></section>
 </div>
}
