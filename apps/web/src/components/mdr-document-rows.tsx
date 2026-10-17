import Link from "next/link";
import {HelpTip} from "@/components/help-tip";
import {DocumentIssueSchedule} from "@/components/document-issue-schedule";
import {MdrDocumentActions} from "@/components/mdr-document-actions";
import type {DocumentSchedule} from "@/lib/document-schedule";
import type {MdrDocument} from "@/lib/mdr-register-types";
import {latestMdrSubmission} from "@/lib/mdr-submission-status";
import {TableScrollRegion} from "@/components/table-scroll-region";

export function MdrDocumentRows({docs,organisationId,projectId,canManage,title,returnToMdr}:{docs:MdrDocument[];organisationId:string;projectId:string;canManage:boolean;title:string;returnToMdr?:string}){
  const base=`/app/${organisationId}/projects/${projectId}`;
  const documentHref=(id:string)=>`${base}/documents/${id}${returnToMdr?`?mdr=${encodeURIComponent(returnToMdr)}`:""}`;
  const actions=(document:MdrDocument)=><MdrDocumentActions organisationId={organisationId} projectId={projectId} documentId={document.id} documentNumber={document.document_number} archived={document.lifecycle_status==="archived"} compact/>;
  if(!docs.length)return <p className="p-5 text-sm text-[#617083]">No documents remain in this discipline for this search.</p>;
  return <>
    <div className="divide-y divide-[#e7ecef] md:hidden">{docs.map(document=><article key={document.id} className="min-w-0 p-4">
      <DocumentLink document={document} href={documentHref(document.id)}/>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-[#617083]"><span className="min-w-0 break-words">{document.document_type} · </span><SubmissionStatus document={document}/><MetadataTip document={document}/></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><CompactSchedule schedule={document.schedule}/>{canManage&&actions(document)}</div>
    </article>)}</div>
    <TableScrollRegion className="hidden md:block" label={`Master document register — ${title} — scroll horizontally for all columns`}>
      <table className="min-w-[680px] w-full text-left text-sm">
        <caption className="sr-only">{title} MDR deliverables</caption>
        <thead className="border-y border-[#e7ecef] bg-[#f4f7fb] text-xs font-medium text-[#617083]"><tr>
          <th scope="col" className="w-[52%] px-4 py-3">Document</th><th scope="col" className="px-4 py-3">Next issue</th><th scope="col" className="px-4 py-3">Status</th>{canManage&&<th scope="col" className="px-4 py-3 text-right">Actions</th>}
        </tr></thead>
        <tbody>{docs.map(document=><tr key={document.id} className="border-b border-[#e7ecef] last:border-0">
          <td className="px-4 py-3"><DocumentLink document={document} href={documentHref(document.id)}/><div className="flex items-center gap-1"><span className="break-words text-xs text-[#617083]">{document.document_type}</span><MetadataTip document={document}/></div></td>
          <td className="px-4 py-3"><CompactSchedule schedule={document.schedule}/></td><td className="px-4 py-3 text-xs text-[#526675]"><SubmissionStatus document={document}/></td>{canManage&&<td className="px-4 py-3">{actions(document)}</td>}
        </tr>)}</tbody>
      </table>
    </TableScrollRegion>
  </>;
}
function SubmissionStatus({document}:{document:MdrDocument}){
  const submission=latestMdrSubmission(document);
  if(!submission)return <span>Not submitted</span>;
  const description=`${submission.label} · Revision ${submission.revisionCode||"not recorded"} · ${submission.controlStatus}`;
  return <span title={description} className="font-semibold"><span className="sr-only">Latest submitted issue: </span>{submission.code}<span className="sr-only"> — {description}</span></span>;
}
function DocumentLink({document,href}:{document:MdrDocument;href:string}){
  return <Link href={href} className="inline-flex min-h-11 min-w-0 flex-col justify-center gap-1 rounded-lg hover:underline"><span className="break-words text-xs font-semibold text-[#10243e]">{document.document_number}</span><span className="break-words text-sm font-medium text-[#24384f]">{document.title}</span></Link>;
}
function MetadataTip({document}:{document:MdrDocument}){
  return <HelpTip label={`Document details for ${document.document_number}`}><dl className="grid gap-2"><div><dt className="font-semibold">Area / system</dt><dd>{[document.area,document.system].filter(Boolean).join(" · ")||"Not recorded"}</dd></div>{document.work_package&&<div><dt className="font-semibold">Work package</dt><dd>{document.work_package}</dd></div>}<div><dt className="font-semibold">Updated</dt><dd>{formatDate(document.updated_at)}</dd></div></dl><div className="mt-3 border-t border-[#e7ecef] pt-3"><DocumentIssueSchedule schedule={document.schedule}/></div></HelpTip>;
}
function CompactSchedule({schedule}:{schedule:DocumentSchedule}){
  return <div className={`text-xs leading-5 ${schedule.overdue?"text-[#a5452f]":"text-[#526675]"}`}><p>{schedule.next_submission_date?`Due ${formatDate(schedule.next_submission_date)}`:schedule.deadline_kind==="terminal_received"?"Terminal issue received":schedule.deadline_kind==="cycle_not_set"?"Revision cycle not set":"Date not planned"}</p>{schedule.overdue&&<p className="font-semibold">Overdue</p>}</div>;
}
function formatDate(value:string){return new Date(value.length===10?`${value}T00:00:00Z`:value).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
