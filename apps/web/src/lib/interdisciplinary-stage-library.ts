import {z} from "zod";

const count=z.number().int().nonnegative();
const stageCounts=z.object({code:z.string(),label:z.string(),total:count,revisionTotal:count,matchTotal:count,matchRevisionTotal:count});
export const interdisciplinaryStageLibrarySchema=z.object({
  projectActive:z.boolean().default(false),
  total:count,revisionTotal:count,matchTotal:count,matchRevisionTotal:count,
  disciplines:z.array(z.object({discipline:z.string(),total:count,revisionTotal:count,matchTotal:count,matchRevisionTotal:count,stages:z.array(stageCounts)})),
  stages:z.array(stageCounts.extend({page:z.number().int().positive(),pageSize:z.number().int().positive(),documents:z.array(z.object({
    document_id:z.string(),document_number:z.string(),title:z.string(),discipline:z.string(),document_type:z.string(),
    revision_id:z.string(),revision_code:z.string(),issue_status:z.string(),issue_date:z.string().nullable(),
    reviewed_at:z.string().nullable().optional(),submitted_at:z.string().nullable().optional(),
  }))})),
});
export type InterdisciplinaryStageLibrary=z.infer<typeof interdisciplinaryStageLibrarySchema>;
export type InterdisciplinaryStage=InterdisciplinaryStageLibrary["stages"][number];
export type InterdisciplinaryLibrarySearch=Record<string,string|string[]|undefined>;

/** Stable HTML IDs without percent characters that fragment decoding can change. */
export const interdisciplinaryStageAnchor=(code:string)=>`stage-${encodeURIComponent(code).replaceAll("_","%5F").replaceAll("%","_")}`;

/** Match the approved-stage RPC's POSIX whitespace trimming and purpose aliases. */
export function interdisciplinaryIssueStageCode(issuePurpose:string){
  const purpose=issuePurpose.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g,"").toLowerCase();
  for(const [code,label] of [["IFR","review"],["IFA","approval"],["IFD","design"],["IFC","construction"]]){
    if(purpose===code.toLowerCase()||purpose===`issued for ${label}`||purpose===`issued for ${label} (${code.toLowerCase()})`)return code;
  }
  return `purpose:${purpose}`;
}

/** Each stage has its own page. Legacy global links still open the requested history. */
export function interdisciplinaryStagePages(search:InterdisciplinaryLibrarySearch){
  const pages:Record<string,number>={};
  const legacy=typeof search.page==="string"?boundedPage(search.page):1;
  for(const code of ["IFR","IFA","IFD","IFC"])pages[code]=legacy;
  for(const [key,value] of Object.entries(search)){
    if(key.startsWith("page_")&&key.length<=205&&typeof value==="string")pages[key.slice(5)]=boundedPage(value);
  }
  return pages;
}

export function interdisciplinaryLibraryQuery(q:string,discipline:string,pages:Record<string,number>={}){
  const query=new URLSearchParams();
  if(q)query.set("q",q);
  if(discipline)query.set("discipline",discipline);
  for(const [code,page] of Object.entries(pages))if(page>1)query.set(`page_${code}`,String(page));
  return query;
}

function boundedPage(value:string){return Math.max(1,Math.min(Number.parseInt(value,10)||1,40000));}
