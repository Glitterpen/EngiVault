import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {requireUser} from "@/lib/auth";
import {ReadUnavailable} from "@/components/read-unavailable";
import {TableScrollRegion} from "@/components/table-scroll-region";

export default async function AuditPage({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<{action?:string}>}){
  const {organisationId}=await params;
  const {action=""}=await searchParams;
  const {supabase}=await requireUser();
  const retryHref=`/app/${organisationId}/audit${action?`?${new URLSearchParams({action})}`:""}`;
  const {data:organisations,error:accessError}=await supabase.rpc("get_my_organisations");
  if(accessError)return <ReadUnavailable title="Audit access could not be checked" href={retryHref}/>;
  if(!organisations?.some((o:{organisation_id:string;role:string})=>o.organisation_id===organisationId&&o.role==="organisation_admin"))notFound();
  let query=supabase.from("audit_events").select("id,project_id,actor_user_id,action,target_type,target_id,outcome,changes,created_at").eq("organisation_id",organisationId).order("created_at",{ascending:false}).limit(200);
  if(action)query=query.eq("action",action);
  const {data,error}=await query;
  if(error)return <ReadUnavailable title="Audit log is temporarily unavailable" href={retryHref}/>;
  return <div className="mx-auto max-w-7xl">
    <Link href={`/app/${organisationId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#10243e]"><ArrowLeft size={16}/> Organisation</Link>
    <h1 className="mt-6 text-3xl font-semibold">Audit log</h1>
    <form className="mt-5 ev-card p-4"><input name="action" defaultValue={action} aria-label="Filter by exact action" className="ev-input w-full" placeholder="Filter exact action, e.g. revision.upload_completed"/></form>
    {data?.length?<TableScrollRegion label="Organisation audit log — scroll horizontally" className="ev-card mt-5"><table className="w-full min-w-[800px] text-left text-sm"><caption className="sr-only">Organisation audit log</caption><thead><tr className="border-b bg-[#f8fafc] text-xs uppercase text-[#617083]"><th scope="col" className="p-4">Time</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Target</th><th scope="col">Actor</th></tr></thead><tbody>{data.map(e=><tr key={e.id} className="border-b last:border-0"><td className="p-4 text-xs">{new Date(e.created_at).toLocaleString()}</td><td>{e.action}</td><td>{e.outcome}</td><td>{e.target_type}</td><td className="text-xs">{e.actor_user_id??"System"}</td></tr>)}</tbody></table></TableScrollRegion>:<p className="ev-card mt-5 p-6 text-sm text-[#526675]">{action?"No audit events match this action.":"No audit events are recorded yet."}</p>}
  </div>;
}
