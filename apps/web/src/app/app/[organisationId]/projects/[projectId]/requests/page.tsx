import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import Link from "next/link";
import {redirect} from "next/navigation";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {projectHomePath} from "@/lib/role-experience";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import {canReviewDeliverableRequest,requestStatusLabel,type DeliverableRequest} from "@/lib/deliverable-requests";
import {normaliseDiscipline} from "@/lib/project-disciplines";
import {NewDeliverableRequestForm,DeliverableRequestReviewForm,CancelDeliverableRequestForm,type RequestDocument} from "@/components/deliverable-request-forms";

export default async function DeliverableRequestsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{document?:string;request?:string;page?:string;view?:string}>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,user,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role),engineer=role==="engineer";
  if(!["engineer","project_admin","document_controller"].includes(role))redirect(projectHomePath(organisationId,projectId,role));
  const base=`/app/${organisationId}/projects/${projectId}`;
  const history=search.view==="history";
  const selectedRequest=z.uuid().safeParse(search.request);
  const page=selectedRequest.success?1:Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,10000));
  let query=supabase.from("deliverable_requests").select("id,kind,status,requester_id,document_id,document_number,title,document_type,discipline,requested_date,previous_due_date,reason,created_at,pm_reviewed_at,pm_comment,dcc_reviewed_at,dcc_comment",{count:"exact"})
    .eq("organisation_id",organisationId).eq("project_id",projectId);
  if(selectedRequest.success)query=query.eq("id",selectedRequest.data);
  else query=query.in("status",history?["accepted","rejected","cancelled","superseded"]:["pending_pm","pending_dcc"]);
  if(engineer)query=query.eq("requester_id",user.id);
  const {data,count,error}=await query.order("created_at",{ascending:false}).order("id").range((page-1)*25,page*25-1);
  if(error)throw new Error("Deliverable requests are temporarily unavailable. Please contact EngiCite support.");
  const requests=(data??[]) as DeliverableRequest[];
  const requesterNames=new Map<string,string>();
  if(!engineer){
    const {data:team,error:teamError}=await supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId});
    if(teamError)throw new Error("The project review team could not be loaded. Please refresh.");
    for(const member of (team??[]) as {user_id:string;display_name:string|null;email:string|null}[])requesterNames.set(member.user_id,member.display_name||member.email||"Project engineer");
  }
  const documents:RequestDocument[]=[];let disciplines:string[]=[];let documentTypes:{code:string;name:string}[]=[];
  if(engineer&&!preview){
    const [{data:scopes,error:scopeError},{data:categories,error:categoryError}]=await Promise.all([
      supabase.from("project_member_disciplines").select("discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).order("discipline"),
      supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId}),
    ]);
    if(scopeError||categoryError)throw new Error("Your request options could not be loaded. Please refresh.");
    const authorisedDisciplines=(scopes??[]).map(item=>item.discipline);
    const selectable=((categories??[]) as {kind:string;name:string}[]).filter(item=>item.kind==="discipline").map(item=>normaliseDiscipline(item.name));
    disciplines=authorisedDisciplines.filter(name=>selectable.includes(normaliseDiscipline(name)));
    documentTypes=((categories??[]) as {kind:string;code:string;name:string}[]).filter(item=>item.kind==="document_type");
    // Page the assignments and bound IN clauses for large MDRs.
    for(let offset=0;;offset+=500){
      const {data:assignments,error:assignmentError}=await supabase.from("document_assignments").select("document_id").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).eq("status","active").order("document_id").range(offset,offset+499);
      if(assignmentError)throw new Error("Your deliverable assignments could not be loaded.");
      const ids=(assignments??[]).map(item=>item.document_id);
      for(let start=0;start<ids.length;start+=100){
        const {data:docs,error:docError}=await supabase.from("documents").select("id,document_number,title,discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").in("id",ids.slice(start,start+100));
        if(docError)throw new Error("Your deliverables could not be loaded.");
        const eligible=(docs??[]).filter(doc=>authorisedDisciplines.some(scope=>normaliseDiscipline(scope)===normaliseDiscipline(doc.discipline)));
        const schedules=await loadDocumentSchedules(supabase,organisationId,projectId,eligible.map(doc=>doc.id));
        for(const doc of eligible){const schedule=schedules.get(doc.id);if(schedule?.next_submission_date)documents.push({...doc,due_date:schedule.next_submission_date});}
      }
      if(ids.length<500)break;
    }
    documents.sort((a,b)=>a.document_number.localeCompare(b.document_number));
  }
  return <div className="mx-auto max-w-[1250px] space-y-5">
    <WorkspacePageHeading title={engineer?"My deliverable requests":"Deliverable requests"} context={engineer?"Track submission-date changes and additional deliverables.":"Review project submission dates and additional deliverables."} help={<HelpTip label="Deliverable request workflow">Submission-date changes: Engineer → PM → DCC. Additional deliverables: Engineer → DCC numbering and approval.</HelpTip>} actions={<Link href={projectHomePath(organisationId,projectId,role)} className="ev-button-secondary min-h-11">Project dashboard</Link>}/>
    {preview&&<p className="rounded-xl border border-[#dce5ef] bg-[#f7f9fc] px-4 py-3 text-sm text-[#526675]">Live member preview · Read-only</p>}
    <div className="space-y-5">
      {engineer&&!preview&&<NewDeliverableRequestForm organisationId={organisationId} projectId={projectId} documents={documents} disciplines={disciplines} documentTypes={documentTypes} selectedDocument={search.document}/>}
      <section className="min-w-0" aria-label="Deliverable request queue">
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#dce5ef] pb-3">
          <nav aria-label="Request status" className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-[#eef3fa] p-1"><Link className={requestTab(!history)} href={`${base}/requests`} aria-current={!history?"page":undefined}>Open requests</Link><Link className={requestTab(history)} href={`${base}/requests?view=history`} aria-current={history?"page":undefined}>Decision history</Link></nav>
          <span className="text-xs text-[#617083]">{selectedRequest.success?"Selected request":`${count??0} ${history?"decided":"open"} request${count===1?"":"s"}`}</span>
        </div>
        {selectedRequest.success&&<Link href={`${base}/requests${history?"?view=history":""}`} className="mb-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#10243e]">← View all {history?"decided":"open"} requests</Link>}
        <div className="space-y-3">{requests.map(request=><article id={`request-${request.id}`} aria-labelledby={`request-title-${request.id}`} key={request.id} className="ev-card min-w-0 scroll-mt-24 p-4 [overflow-wrap:anywhere] sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-[#617083]">{request.kind==="date_change"?"Submission date change":"Additional deliverable"}</p><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${requestStatusStyle(request.status)}`}>{requestStatusLabel[request.status]}</span></div>
          <h2 id={`request-title-${request.id}`} className="mt-2 text-base font-semibold leading-6">{request.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[#526675]"><span className="font-medium text-[#24384f]">{request.document_number??"Document number to be assigned by DCC"}</span> · {request.discipline} · {request.document_type}</p>
          <p className="mt-1 text-xs leading-5 text-[#617083]">Requested by {engineer?"you":requesterNames.get(request.requester_id??"")??"Former project member"}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#edf1f7] py-3 text-sm sm:grid-cols-3">
            {request.previous_due_date&&<div className="min-w-0"><dt className="ev-label">Current date at request</dt><dd className="mt-1">{formatDate(request.previous_due_date)}</dd></div>}
            <div className="min-w-0"><dt className="ev-label">Requested submission</dt><dd className="mt-1 font-semibold">{formatDate(request.requested_date)}</dd></div>
            <div className="min-w-0"><dt className="ev-label">Requested on</dt><dd className="mt-1">{formatDate(request.created_at.slice(0,10))}</dd></div>
            {request.pm_reviewed_at&&<div className="min-w-0"><dt className="ev-label">PM reviewed</dt><dd className="mt-1">{formatDate(request.pm_reviewed_at.slice(0,10))}</dd></div>}
            {request.dcc_reviewed_at&&<div className="min-w-0"><dt className="ev-label">DCC reviewed</dt><dd className="mt-1">{formatDate(request.dcc_reviewed_at.slice(0,10))}</dd></div>}
          </dl>
          <details className="mt-2 min-w-0"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-[#526675] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e]">Request details</summary>
            <div className="space-y-3 rounded-xl bg-[#f7f9fc] p-3 text-sm leading-6"><div><h3 className="text-xs font-semibold text-[#617083]">Reason for request</h3><p className="mt-1 whitespace-pre-wrap">{request.reason}</p></div>
              {request.pm_reviewed_at&&<div><h3 className="text-xs font-semibold text-[#617083]">PM review comment</h3><p className="mt-1 whitespace-pre-wrap">{request.pm_comment||"Reviewed"}</p></div>}
              {request.dcc_reviewed_at&&<div><h3 className="text-xs font-semibold text-[#617083]">DCC review comment</h3><p className="mt-1 whitespace-pre-wrap">{request.dcc_comment||"Reviewed"}</p></div>}
            </div>
          </details>
          {canReviewDeliverableRequest(role,request,user.id,Boolean(preview))&&<DeliverableRequestReviewForm organisationId={organisationId} projectId={projectId} request={request}/>}
          {engineer&&!preview&&request.requester_id===user.id&&["pending_pm","pending_dcc"].includes(request.status)&&<CancelDeliverableRequestForm organisationId={organisationId} projectId={projectId} requestId={request.id}/>}
          {request.status==="accepted"&&request.document_id&&role!=="project_admin"&&<Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[#10243e]" href={`${base}/documents/${request.document_id}`}>Open MDR deliverable →</Link>}
        </article>)}</div>
        {!requests.length&&<p className="ev-card p-6 text-center text-sm text-[#617083]">{selectedRequest.success?"This request is not available in your current project access.":`No ${history?"decided":"open"} requests.`}</p>}
        <nav aria-label="Request pages" className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">{page>1?<Link className="inline-flex min-h-11 items-center font-semibold text-[#10243e]" href={`${base}/requests?view=${history?"history":"open"}&page=${page-1}`}>← Previous</Link>:<span/>}<span className="text-xs text-[#617083]">Page {page} · {count??0} requests</span>{page*25<(count??0)?<Link className="inline-flex min-h-11 items-center font-semibold text-[#10243e]" href={`${base}/requests?view=${history?"history":"open"}&page=${page+1}`}>Next →</Link>:<span/>}</nav>
      </section>
    </div>
  </div>;
}
function formatDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
function requestTab(active:boolean){return `inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e] ${active?"bg-white text-[#10243e] shadow-sm":"text-[#526675] hover:bg-white/60"}`;}
function requestStatusStyle(status:DeliverableRequest["status"]){
  if(status==="accepted")return "bg-[#eef3fa] text-[#10243e]";
  if(status==="rejected")return "bg-[#fff0eb] text-[#963c28]";
  if(status==="pending_pm"||status==="pending_dcc")return "bg-[#edf2f7] text-[#36526b]";
  return "bg-[#f0f2f3] text-[#526675]";
}
