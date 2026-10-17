import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {requireUser} from "@/lib/auth";
import {ReadUnavailable} from "@/components/read-unavailable";
import {TableScrollRegion} from "@/components/table-scroll-region";
import {BrowseNavigation} from "@/components/browse-navigation";
import {browseHref,browsePage,browseSearch,browseTextFilter,browseValue,readBrowsePage,type BrowseQuery} from "@/lib/read-only-browse";

export default async function AuditPage({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<BrowseQuery>}){
  const {organisationId}=await params;
  const filters=await searchParams,action=browseValue(filters.action).trim().slice(0,100),q=browseSearch(filters.q),page=browsePage(filters.page);
  const {supabase}=await requireUser();
  const path=`/app/${organisationId}/audit`,retryHref=browseHref(path,{action,q,page});
  const {data:organisations,error:accessError}=await supabase.rpc("get_my_organisations");
  if(accessError)return <ReadUnavailable title="Audit access could not be checked" href={retryHref}/>;
  if(!organisations?.some((o:{organisation_id:string;role:string})=>o.organisation_id===organisationId&&o.role==="organisation_admin"))notFound();
  type Event={id:string;project_id:string|null;actor_user_id:string|null;action:string;target_type:string;target_id:string|null;outcome:string;created_at:string};
  let result;
  try{result=await readBrowsePage<Event>(async(start,end)=>{
    let query=supabase.from("audit_events").select("id,project_id,actor_user_id,action,target_type,target_id,outcome,created_at",{count:"exact"})
      .eq("organisation_id",organisationId).order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,end);
    if(action)query=query.eq("action",action);
    if(q)query=query.or(browseTextFilter(q,["action","target_type","outcome"]));
    const response=await query;return {...response,data:response.data as Event[]|null};
  },page);}catch{return <ReadUnavailable title="Audit log is temporarily unavailable" href={retryHref}/>;}
  const data=result.items;
  return <div className="mx-auto min-w-0 max-w-7xl">
    <Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/> Organisation</Link>
    <h1 className="mt-6 text-3xl font-semibold">Audit log</h1>
    <form data-preview-safe method="get" action={path} aria-label="Search audit history" className="mt-5 ev-card flex min-w-0 flex-wrap items-end gap-3 p-4">
      <label className="min-w-0 flex-1 basis-56"><span className="ev-label">Search action, outcome or target type</span><input type="search" name="q" defaultValue={q} maxLength={100} className="ev-input" placeholder="e.g. accepted, denied or document"/></label>
      <label className="min-w-0 flex-1 basis-56"><span className="ev-label">Filter by exact action</span><input name="action" defaultValue={action} maxLength={100} className="ev-input" placeholder="e.g. revision.upload_completed"/></label>
      <button className="ev-button-secondary">Search</button>{(q||action)&&<Link className="ev-button-secondary" href={path}>Clear filters</Link>}
    </form>
    <BrowseNavigation path={path} query={{action,q}} {...result} count={data.length} label="Audit events"/>
    {data.length?<TableScrollRegion label="Organisation audit log — scroll horizontally" className="ev-card mt-2"><table className="w-full min-w-[800px] text-left text-sm"><caption className="sr-only">Organisation audit log</caption><thead><tr className="border-b bg-[#f8fafc] text-xs uppercase text-[#617083]"><th scope="col" className="p-4">Time</th><th scope="col">Action</th><th scope="col">Outcome</th><th scope="col">Target</th><th scope="col">Actor</th></tr></thead><tbody>{data.map(e=><tr key={e.id} className="border-b last:border-0"><td className="p-4 text-xs"><time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC</time></td><td className="break-words">{e.action}</td><td>{e.outcome}</td><td>{e.target_type}</td><td className="break-all text-xs">{e.actor_user_id??"System"}</td></tr>)}</tbody></table></TableScrollRegion>:<p className="ev-card mt-5 p-6 text-sm text-[#526675]">{action||q?"No audit events match this search and action.":"No audit events are recorded yet."}</p>}
  </div>;
}
