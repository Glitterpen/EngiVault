import Link from "next/link";
import {ArrowUpRight,Settings} from "lucide-react";
import {requireUser} from "@/lib/auth";
import {OrganisationCreateForm} from "@/components/organisation-create-form";
import {OrganisationLogo} from "@/components/organisation-logo";
import {canCreateOrganisationWorkspace} from "@/lib/role-experience";

export default async function AppHome(){
 const {supabase,user}=await requireUser();
 const {data,error}=await supabase.rpc("get_my_organisations");
 if(error)throw new Error(`Organisation access failed: ${error.code} ${error.message}`);
 const orgs=(data??[]) as Array<{organisation_id:string;name:string;slug:string;role:string}>;
 const projectRoles:string[]=[];
 if(!orgs.length){
  const {data:projectAccess}=await supabase.from("project_access").select("role").limit(1);
  projectRoles.push(...(projectAccess??[]).map(item=>String(item.role)));
 }
 const organisationOnboarding=user.user_metadata?.onboarding_mode==="organisation";
 const canCreateOrganisation=canCreateOrganisationWorkspace(orgs.map(org=>org.role),projectRoles,organisationOnboarding);
 return <div className="mx-auto max-w-6xl">
  <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Secure workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Your organisations</h1><p className="mt-2 text-[#617083]">Choose an organisation to open the projects and responsibilities assigned to you.</p></div></div>
  <div className={`mt-8 grid gap-5 ${canCreateOrganisation?"lg:grid-cols-[1fr_360px]":""}`}>
   <section className="grid content-start gap-3">{orgs.length?orgs.map(org=><article key={org.organisation_id} className="ev-card flex items-center gap-2 p-2 transition hover:-translate-y-0.5">
    <Link href={`/app/${org.organisation_id}`} className="flex min-w-0 flex-1 items-center gap-4 rounded-xl p-3">
     <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#eadfd8] bg-white text-[#e8733f]"><OrganisationLogo organisationId={org.organisation_id} name={org.name} size={48} className="size-full object-contain p-1.5"/></span>
     <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{org.name}</h2><p className="mt-1 text-xs uppercase tracking-[.1em] text-[#617083]">{org.role==="organisation_admin"?"Organisation Administrator":"Project team member"}</p></div><ArrowUpRight size={18}/>
    </Link>
    {org.role==="organisation_admin"&&<Link href={`/app/${org.organisation_id}/settings`} aria-label={`Manage ${org.name}`} title="Edit or delete organisation" className="grid size-10 shrink-0 place-items-center rounded-xl text-[#617083] transition hover:bg-[#eef4f1] hover:text-[#0c5b45]"><Settings size={18}/></Link>}
   </article>):<div className="ev-card p-10 text-center text-[#617083]">No organisation memberships yet.</div>}</section>
   {canCreateOrganisation&&<OrganisationCreateForm/>}
  </div>
 </div>
}
