import {HelpTip} from "@/components/help-tip";
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
  return <div className="mx-auto max-w-[1250px]">
    <Link href={projectHomePath(organisationId,projectId,role)} className="text-sm font-semibold text-[#0c5b45]">← Project dashboard</Link>
    <h1 className="mt-5 text-3xl font-semibold">{engineer?"My deliverable requests":"Deliverable requests"} <HelpTip label="Deliverable request workflow">Submission-date changes: Engineer → PM → DCC. Additional deliverables: Engineer → DCC numbering and approval.</HelpTip></h1>

    {preview&&<p className="mt-3 text-sm text-[#a5452f]">Live member preview · Read-only</p>}
    <div className={`mt-6 grid items-start gap-6 ${engineer&&!preview?"lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]":""}`}>
      {engineer&&!preview&&<NewDeliverableRequestForm organisationId={organisationId} projectId={projectId} documents={documents} disciplines={disciplines} documentTypes={documentTypes} selectedDocument={search.document}/>}
      <section className="min-w-0">
        <nav aria-label="Request status" className="mb-4 flex flex-wrap gap-2"><Link className={history?"ev-button-secondary":"ev-button"} href={`${base}/requests`} aria-current={!history?"page":undefined}>Open requests</Link><Link className={history?"ev-button":"ev-button-secondary"} href={`${base}/requests?view=history`} aria-current={history?"page":undefined}>Decision history</Link></nav>
        <div className="space-y-4">{requests.map(request=><article id={`request-${request.id}`} key={request.id} className="ev-card scroll-mt-24 break-words p-5">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs font-bold text-[#e8733f]">{request.kind==="date_change"?"Submission date change":"Additional deliverable"}</p><span className="rounded-full bg-[#edf2f7] px-3 py-1 text-xs font-semibold">{requestStatusLabel[request.status]}</span></div>
          <h2 className="mt-3 font-semibold">{request.title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#617083]">{request.document_number??"Document number to be assigned by DCC"} · {request.discipline} · {request.document_type}</p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{request.previous_due_date&&<div><dt className="ev-label">Current date at request</dt><dd>{formatDate(request.previous_due_date)}</dd></div>}<div><dt className="ev-label">Requested submission</dt><dd className="font-semibold">{formatDate(request.requested_date)}</dd></div></dl>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{request.reason}</p>
          <p className="mt-3 text-xs text-[#617083]">Requested by {engineer?"you":requesterNames.get(request.requester_id??"")??"Former project member"} · {formatDate(request.created_at.slice(0,10))}</p>
          {request.pm_reviewed_at&&<p className="mt-3 text-sm leading-6"><strong>PM review · {formatDate(request.pm_reviewed_at.slice(0,10))}:</strong> {request.pm_comment||"Reviewed"}</p>}
          {request.dcc_reviewed_at&&<p className="mt-2 text-sm leading-6"><strong>DCC review · {formatDate(request.dcc_reviewed_at.slice(0,10))}:</strong> {request.dcc_comment||"Reviewed"}</p>}
          {canReviewDeliverableRequest(role,request,user.id,Boolean(preview))&&<DeliverableRequestReviewForm organisationId={organisationId} projectId={projectId} request={request}/>}
          {engineer&&!preview&&request.requester_id===user.id&&["pending_pm","pending_dcc"].includes(request.status)&&<CancelDeliverableRequestForm organisationId={organisationId} projectId={projectId} requestId={request.id}/>}
          {request.status==="accepted"&&request.document_id&&role!=="project_admin"&&<Link className="mt-4 inline-block text-sm font-semibold text-[#0c5b45]" href={`${base}/documents/${request.document_id}`}>Open MDR deliverable →</Link>}
        </article>)}</div>
        {!requests.length&&<p className="ev-card p-8 text-center text-sm text-[#617083]">No {history?"decided":"open"} requests.</p>}
        <nav aria-label="Request pages" className="mt-4 flex items-center justify-between text-sm">{page>1?<Link href={`${base}/requests?view=${history?"history":"open"}&page=${page-1}`}>← Previous</Link>:<span/>}<span>Page {page} · {count??0} requests</span>{page*25<(count??0)?<Link href={`${base}/requests?view=${history?"history":"open"}&page=${page+1}`}>Next →</Link>:<span/>}</nav>
      </section>
    </div>
  </div>;
}
function formatDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
