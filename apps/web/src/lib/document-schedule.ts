import type {SupabaseClient} from "@supabase/supabase-js";

export type DocumentSchedule={document_id:string;planned_submission_date:string|null;next_submission_date:string|null;last_issue_date:string|null;revision_cycle_days:number|null;deadline_kind:"first_issue"|"next_revision"|"terminal_received"|"cycle_not_set";overdue:boolean};

export async function loadDocumentSchedules(client:SupabaseClient,organisationId:string,projectId:string,documentIds:string[]){
  if(!documentIds.length)return new Map<string,DocumentSchedule>();
  const rows:DocumentSchedule[]=[];
  // Bound URL size and avoid the API's default row cap on large registers.
  for(let offset=0;offset<documentIds.length;offset+=100){
    const {data,error}=await client.from("project_document_progress")
      .select("document_id,planned_submission_date,next_submission_date,last_issue_date,revision_cycle_days,deadline_kind,overdue")
      .eq("organisation_id",organisationId).eq("project_id",projectId).in("document_id",documentIds.slice(offset,offset+100));
    if(error)throw new Error("MDR revision schedules are temporarily unavailable. Please contact EngiCite support.");
    rows.push(...(data??[]) as DocumentSchedule[]);
  }
  if(rows.length!==new Set(documentIds).size)throw new Error("Some MDR revision schedules could not be loaded. Refresh the page.");
  return new Map(rows.map(row=>[row.document_id,row]));
}
