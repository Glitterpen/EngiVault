import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import type {MdrDocument,MdrDisciplineSummary,MdrFolderPage} from "@/lib/mdr-register-types";

const INDEX_PAGE_SIZE=500;
const FOLDER_PAGE_SIZE=25;
const UNAVAILABLE="The MDR could not be loaded. Refresh to try again.";
const DOCUMENT_SELECTION="id,document_number,title,document_type,discipline,status,area,system,work_package,planned_submission_date,updated_at,lifecycle_status,document_revisions(state)";
type Records="active"|"archived";
type IndexRow={id:string;discipline:string};
type DocumentRow=Omit<MdrDocument,"schedule">;

export function cleanMdrSearch(value:string):string{
  // Keep a single text term inside the PostgREST OR group, including the
  // deliberately narrower read-only member-preview query parser.
  return value.replaceAll(/[,%()"\\\u0000-\u001f\u007f]/g,"").trim().slice(0,100);
}

function searchExpression(search:string){
  return ["document_number","title","discipline","document_type"].map(column=>`${column}.ilike.%${search}%`).join(",");
}

function validCount(count:number|null):count is number{
  return count!==null&&Number.isSafeInteger(count)&&count>=0;
}

export async function loadMdrDisciplineIndex(client:SupabaseClient,organisationId:string,projectId:string,records:Records,search:string):Promise<{disciplines:MdrDisciplineSummary[];total:number}>{
  const term=cleanMdrSearch(search),seen=new Set<string>(),counts=new Map<string,number>();
  let total:number|undefined;
  for(;;){
    let query=client.from("documents").select("id,discipline",{count:"exact"})
      .eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status",records)
      .order("id").range(seen.size,seen.size+INDEX_PAGE_SIZE-1);
    if(term)query=query.or(searchExpression(term));
    const {data,error,count}=await query;
    if(error||!Array.isArray(data)||!validCount(count)||(total!==undefined&&count!==total))throw new Error(UNAVAILABLE);
    total=count;
    if(data.length>INDEX_PAGE_SIZE||(!data.length&&seen.size<total))throw new Error(UNAVAILABLE);
    for(const row of data as IndexRow[]){
      if(typeof row.id!=="string"||!row.id||seen.has(row.id)||typeof row.discipline!=="string"||!row.discipline.trim())throw new Error(UNAVAILABLE);
      seen.add(row.id);
      counts.set(row.discipline,(counts.get(row.discipline)??0)+1);
    }
    if(seen.size>total)throw new Error(UNAVAILABLE);
    if(seen.size===total)return {disciplines:[...counts].map(([name,count])=>({name,count})).sort((a,b)=>a.name.localeCompare(b.name)),total};
    // Advance by the actual row count: an installation may cap responses below
    // 500, and a short response must never hide the remaining disciplines.
  }
}

export async function loadMdrFolderPage(client:SupabaseClient,organisationId:string,projectId:string,records:Records,search:string,discipline:string,page:number):Promise<Omit<MdrFolderPage,"canManage">>{
  const term=cleanMdrSearch(search);
  let countQuery=client.from("documents").select("id",{count:"exact",head:true})
    .eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status",records).eq("discipline",discipline).limit(1);
  if(term)countQuery=countQuery.or(searchExpression(term));
  const {count:total,error:countError}=await countQuery;
  if(countError||!validCount(total))throw new Error(UNAVAILABLE);
  const lastPage=Math.max(1,Math.ceil(total/FOLDER_PAGE_SIZE));
  const currentPage=Math.min(Math.max(1,Number.isSafeInteger(page)?page:1),lastPage);
  const offset=(currentPage-1)*FOLDER_PAGE_SIZE,expected=Math.min(FOLDER_PAGE_SIZE,total-offset);
  const rows:DocumentRow[]=[],seen=new Set<string>();
  while(rows.length<expected){
    let query=client.from("documents").select(DOCUMENT_SELECTION,{count:"exact"})
      .eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status",records).eq("discipline",discipline)
      .order("document_number").order("id").range(offset+rows.length,offset+expected-1);
    if(term)query=query.or(searchExpression(term));
    const {data,error,count}=await query;
    if(error||!Array.isArray(data)||count!==total||!data.length||data.length>expected-rows.length)throw new Error(UNAVAILABLE);
    for(const row of data as DocumentRow[]){
      if(typeof row.id!=="string"||!row.id||seen.has(row.id)||row.discipline!==discipline)throw new Error(UNAVAILABLE);
      seen.add(row.id);rows.push(row);
    }
  }
  const schedules=await loadDocumentSchedules(client,organisationId,projectId,rows.map(row=>row.id));
  const documents=rows.map(row=>{
    const schedule=schedules.get(row.id);
    if(!schedule)throw new Error(UNAVAILABLE);
    return {...row,schedule};
  });
  return {documents,total,page:currentPage,pageSize:FOLDER_PAGE_SIZE};
}
