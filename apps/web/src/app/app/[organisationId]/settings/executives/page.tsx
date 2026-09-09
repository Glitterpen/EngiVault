import Link from "next/link";
import {requireExecutiveAdministrator,executiveDirectorySchema} from "@/lib/executive-admin";
import {ExecutiveInviteForm,ExecutiveRevokeForm} from "@/components/executive-access-forms";
import {HelpTip} from "@/components/help-tip";

export default async function ExecutiveSettings({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<{page?:string}>}){
  const {organisationId}=await params;
  const {page:pageValue}=await searchParams;
  const page=Math.max(1,Math.min(100000,Number.parseInt(pageValue??"1",10)||1));
  const {supabase,organisation}=await requireExecutiveAdministrator(organisationId);
  const {data,error}=await supabase.rpc("list_organisation_executives",{target_organisation:organisationId,page_offset:(page-1)*25});
  const directory=executiveDirectorySchema.safeParse(data);
  if(error||!directory.success)throw new Error("Executive access management could not be loaded. Please retry.");
  const base=`/app/${organisationId}/settings/executives`;
  return <div className="mx-auto max-w-3xl"><Link className="ev-button-secondary" href={`/app/${organisationId}/settings`}>Organisation settings</Link>
    <h1 className="mt-6 text-3xl font-semibold">Executive access <HelpTip label="Executive directory privacy">This directory is available only to Organisation Administrators. Executive Viewers are not added to project teams. Invitations, acceptance, dashboard views and revocations are retained in organisation-level security audit records.</HelpTip></h1><p className="mt-2 text-sm text-[#617083]">{organisation.name}</p>
    <Link href={`/app/${organisationId}/executive`} className="ev-button-secondary mt-4">Open read-only executive dashboard</Link>
    <ExecutiveInviteForm organisationId={organisationId}/>
    <section className="mt-6 space-y-3" aria-label="Private executive directory">{directory.data.entries.map(entry=><article key={`${entry.kind}-${entry.id}`} className="ev-card min-w-0 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{entry.display_name}</h2><p className="mt-1 break-all text-sm">{entry.email}</p><p className="mt-2 text-xs font-semibold capitalize text-[#617083]">{entry.status}{entry.expires_at?` · Expires ${new Date(entry.expires_at).toLocaleDateString("en-GB")}`:""}</p></div>{["active","pending","expired"].includes(entry.status)&&<ExecutiveRevokeForm organisationId={organisationId} id={entry.id} kind={entry.kind} email={entry.email}/>}</div></article>)}{!directory.data.entries.length&&<p className="ev-card p-6 text-sm text-[#617083]">No executive access entries on this page.</p>}</section>
    <nav aria-label="Executive directory pages" className="mt-5 flex flex-wrap items-center gap-3">{page>1&&<Link className="ev-button-secondary" href={`${base}?page=${page-1}`}>Previous</Link>}<span className="text-sm">Page {page} · {directory.data.total} entries</span>{page*25<directory.data.total&&<Link className="ev-button-secondary" href={`${base}?page=${page+1}`}>Next</Link>}</nav>
  </div>;
}
