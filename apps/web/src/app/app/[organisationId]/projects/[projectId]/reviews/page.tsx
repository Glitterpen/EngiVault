import { HelpTip } from "@/components/help-tip";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SubmissionReviewQueue, type SubmissionReviewRow } from "@/components/submission-review-queue";
import { requireProject } from "@/lib/auth";
import {BrowseNavigation} from "@/components/browse-navigation";
import {browseHref,browsePage,browseSearch,browseValue,readBrowseIndex,sliceBrowsePage,type BrowseQuery} from "@/lib/read-only-browse";

export default async function ReviewsPage({ params,searchParams }: {
  params: Promise<{ organisationId: string; projectId: string }>;
  searchParams?:Promise<BrowseQuery>;
}) {
  const { organisationId, projectId } = await params;
  const { supabase, access, preview } = await requireProject(organisationId, projectId);

  if (String(access.role) !== "document_controller") notFound();

  const pageHref = `/app/${organisationId}/projects/${projectId}/reviews`;
  const query=await searchParams??{},q=browseSearch(query.q);
  const requestedState=browseValue(query.state),state=["ready","processing","failed"].includes(requestedState)?requestedState:"";
  let rows:SubmissionReviewRow[]=[];let error=false;
  try{
    rows=await readBrowseIndex<SubmissionReviewRow>(async(start,end)=>{
      const result=await supabase.from("document_revisions")
        .select("id,document_id,revision_code,issue_status,original_filename,native_original_filename,created_at,state,documents!inner(document_number,title,discipline)",{count:"exact"})
        .eq("organisation_id",organisationId).eq("project_id",projectId).eq("control_status","submitted").neq("state","pending_upload")
        .order("created_at").order("id").range(start,end);
      return {...result,data:result.data as unknown as SubmissionReviewRow[]|null};
    });
  }catch{error=true;}
  const term=q.toLocaleLowerCase(),filtered=rows.filter(row=>(!state||(state==="processing"?["quarantined","queued","processing"].includes(row.state):row.state===state))&&
    `${row.documents?.document_number??""} ${row.documents?.title??""} ${row.documents?.discipline??""} ${row.revision_code} ${row.issue_status} ${row.original_filename} ${row.native_original_filename??""}`.toLocaleLowerCase().includes(term));
  const result=sliceBrowsePage(filtered,browsePage(query.page));
  const retryHref=browseHref(pageHref,{q,state,page:browsePage(query.page)});

  return <div className="mx-auto min-w-0 max-w-6xl space-y-4">
    <header>
      <Link href={`/app/${organisationId}/projects/${projectId}/control`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e]">
        <ArrowLeft aria-hidden="true" size={16} /> Document control centre
      </Link>
      <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex min-w-0 flex-wrap items-center gap-2 break-words text-2xl font-semibold leading-tight tracking-tight text-[#10243e] sm:text-[1.75rem]">
          Submission review
          <HelpTip label="Reviewing engineer submissions">Open a submission to check its files and MDR details. Confirm conformance before approving, or return it with clear instructions. The queue is ordered oldest first.</HelpTip>
        </h1>
        {!error ? <p className="text-sm text-[#617083]">{rows.length} submission{rows.length === 1 ? "" : "s"} awaiting review</p> : null}
      </div>
      {preview ? <p className="mt-2 text-sm text-[#617083]">Audited DCC preview · Read-only</p> : null}
    </header>

    <form data-preview-safe method="get" action={pageHref} aria-label="Search submission review" className="ev-card flex min-w-0 flex-wrap items-end gap-3 p-4">
      <label className="min-w-0 flex-1 basis-60"><span className="ev-label">Search submissions</span><input type="search" name="q" defaultValue={q} maxLength={100} className="ev-input" placeholder="Document number, title, discipline or revision"/></label>
      <label className="min-w-0 basis-44"><span className="ev-label">Security status</span><select name="state" defaultValue={state} className="ev-input"><option value="">All submissions</option><option value="ready">Ready for review</option><option value="processing">Security processing</option><option value="failed">Processing failed</option></select></label>
      <button className="ev-button-secondary">Search</button>{(q||state)&&<Link href={pageHref} className="ev-button-secondary">Clear search</Link>}
    </form>
    {error ? <div className="ev-card p-5" role="alert">
      <p className="font-semibold text-[#102842]">Submissions could not be loaded.</p>
      <p className="mt-1 text-sm text-[#617083]">Try again shortly. No review decisions have been changed.</p>
      <a href={retryHref} data-preview-safe className="ev-button-secondary mt-4 min-h-11">Retry submissions</a>
    </div> : <><BrowseNavigation path={pageHref} query={{q,state}} {...result} count={result.items.length} label="Submissions"/>{result.items.length ? <SubmissionReviewQueue organisationId={organisationId} projectId={projectId} rows={result.items} readOnly={Boolean(preview)} /> : <div className="ev-card px-4 py-4 text-sm text-[#617083] sm:px-5">
      {q||state?"No submissions match this search and status. Clear the search to return to the full queue.":"No engineer submissions are waiting for review."}
    </div>}</>}
  </div>;
}
