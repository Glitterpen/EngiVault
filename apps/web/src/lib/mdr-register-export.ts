import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadMdrDisciplineIndex,loadMdrFolderPage} from "@/lib/mdr-register-data";
import type {MdrDocument} from "@/lib/mdr-register-types";
import {latestMdrSubmission} from "@/lib/mdr-submission-status";

const PAGE_SIZE=25;
const MAX_EXPORT_DOCUMENTS=100_000;
const UNAVAILABLE="The MDR download could not be prepared. Retry shortly.";
type Records="active"|"archived";

const columns=[
  "Document number","Title","Discipline","Document type","Latest revision","Latest issue code",
  "Latest issue purpose","Submitted at (UTC)","Document control review status","First planned issue date",
  "Previous issue date","Next due date","Revision cycle (working days)","Overdue","Record status",
  "Area","System","Work package",
];

function validCount(value:number){return Number.isSafeInteger(value)&&value>=0;}

/** Read every folder and page using the same RLS/preview client as the register. */
export async function loadMdrRegisterExport(client:SupabaseClient,organisationId:string,projectId:string,records:Records):Promise<MdrDocument[]>{
  // A download always covers the full active/removed register, not a search or
  // the currently expanded discipline. No privileged client or storage copy.
  const index=await loadMdrDisciplineIndex(client,organisationId,projectId,records,"");
  if(!validCount(index.total)||index.total>MAX_EXPORT_DOCUMENTS||!Array.isArray(index.disciplines))throw new Error(UNAVAILABLE);
  const names=new Map<string,number>();
  let indexed=0;
  for(const folder of index.disciplines){
    if(typeof folder.name!=="string"||!folder.name.trim()||names.has(folder.name)||!validCount(folder.count)||folder.count<1)throw new Error(UNAVAILABLE);
    names.set(folder.name,folder.count);indexed+=folder.count;
  }
  if(indexed!==index.total)throw new Error(UNAVAILABLE);
  const documents:MdrDocument[]=[],seen=new Set<string>();
  for(const folder of index.disciplines){
    const pages=Math.ceil(folder.count/PAGE_SIZE);
    for(let page=1;page<=pages;page++){
      const result=await loadMdrFolderPage(client,organisationId,projectId,records,"",folder.name,page);
      const expected=Math.min(PAGE_SIZE,folder.count-(page-1)*PAGE_SIZE);
      // Do not offer a partial CSV if the register changed or a response was
      // capped/truncated while it was being assembled. The user can retry.
      if(result.total!==folder.count||result.page!==page||result.pageSize!==PAGE_SIZE||!Array.isArray(result.documents)||result.documents.length!==expected)throw new Error(UNAVAILABLE);
      for(const document of result.documents){
        if(typeof document.id!=="string"||!document.id||seen.has(document.id)||document.discipline!==folder.name||document.lifecycle_status!==records||!document.schedule)throw new Error(UNAVAILABLE);
        seen.add(document.id);documents.push(document);
      }
    }
  }
  if(documents.length!==index.total)throw new Error(UNAVAILABLE);
  // A discipline may have been added/removed while another folder was read,
  // including the first record appearing after an initially empty index.
  // Check again so that a changed register never looks complete.
  const verified=await loadMdrDisciplineIndex(client,organisationId,projectId,records,"");
  if(verified.total!==index.total||verified.disciplines.length!==index.disciplines.length||new Set(verified.disciplines.map(folder=>folder.name)).size!==verified.disciplines.length||verified.disciplines.some(folder=>folder.count!==names.get(folder.name)))throw new Error(UNAVAILABLE);
  return documents;
}

function csvCell(value:string|number|null|undefined){
  const text=value==null?"":String(value);
  // Quoting alone does not stop spreadsheet formulas. Prefix an apostrophe
  // before formula characters hidden behind whitespace/control/format marks;
  // protect leading tab/newline cells as well. Preserve the original text.
  const safe=/^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text)?`'${text}`:text;
  return `"${safe.replaceAll('"','""')}"`;
}

export function createMdrRegisterCsv(documents:MdrDocument[]):string{
  const rows=documents.map(document=>{
    const latest=latestMdrSubmission(document),schedule=document.schedule;
    return [
      document.document_number,document.title,document.discipline,document.document_type,
      latest?.revisionCode??"",latest?.code??"",latest?.label??"Not submitted",latest?.submittedAt??"",latest?.controlStatus??"",
      schedule.planned_submission_date??document.planned_submission_date,schedule.last_issue_date,schedule.next_submission_date,
      schedule.revision_cycle_days,schedule.overdue?"Yes":"No",document.lifecycle_status,document.area,document.system,document.work_package,
    ].map(csvCell).join(",");
  });
  // BOM helps Excel recognise UTF-8 discipline names; CRLF is conventional CSV.
  return `\uFEFF${[columns.map(csvCell).join(","),...rows].join("\r\n")}\r\n`;
}
