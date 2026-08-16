export async function embedSearchQuery(text:string):Promise<number[]|null>{
  const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";
  try{const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/embed-query`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},body:JSON.stringify({text}),cache:"no-store",signal:AbortSignal.timeout(8000)});if(!response.ok)return null;const body=await response.json() as {embedding?:number[]};return Array.isArray(body.embedding)?body.embedding:null}catch{return null}
}

export type GroundedAnswer={answer:string;grounded:boolean;source_ids:number[];model:string;provider_request_id:string|null;input_tokens:number;output_tokens:number;latency_ms:number};
export async function generateGroundedAnswer(question:string,evidence:{content:string}[]):Promise<GroundedAnswer>{
  const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";
  const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/answer`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},body:JSON.stringify({question,evidence}),cache:"no-store",signal:AbortSignal.timeout(100000)});
  if(!response.ok)throw new Error("ANSWER_SERVICE_UNAVAILABLE");return response.json() as Promise<GroundedAnswer>;
}
export async function processRevisionComparison(comparisonId:string,baseRevisionId:string,targetRevisionId:string):Promise<boolean>{const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";try{const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/compare`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},body:JSON.stringify({comparison_id:comparisonId,base_revision_id:baseRevisionId,target_revision_id:targetRevisionId}),cache:"no-store",signal:AbortSignal.timeout(100000)});return response.ok}catch{return false}}
export async function buildWorkPackage(packageId:string):Promise<boolean>{const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";try{const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/build-package`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},body:JSON.stringify({package_id:packageId}),cache:"no-store",signal:AbortSignal.timeout(300000)});return response.ok}catch{return false}}
export async function getWorkPackageDownloadUrl(packageId:string):Promise<string|null>{const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";try{const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/package-download-url`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},body:JSON.stringify({package_id:packageId}),cache:"no-store",signal:AbortSignal.timeout(10000)});if(!response.ok)return null;const body=await response.json() as {url?:string};return body.url??null}catch{return null}}

export type MdrWorkbookParseResult={sheet_name:string;header_row:number;row_count:number;rows:Array<Record<string,unknown>>};
export async function parseMdrWorkbook(file:File):Promise<MdrWorkbookParseResult>{
  const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";
  const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/parse-mdr-import`,{method:"POST",headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","x-filename":"MDR-Import.xlsx","x-processor-secret":secret},body:await file.arrayBuffer(),cache:"no-store",signal:AbortSignal.timeout(30000)});
  if(!response.ok){const body=await response.json().catch(()=>null) as {detail?:string}|null;throw new Error(body?.detail??"The Excel workbook could not be read.")}
  return response.json() as Promise<MdrWorkbookParseResult>;
}

export async function processNextDocumentRevision():Promise<string>{
  const base=process.env.PROCESSOR_URL??"http://127.0.0.1:8000";const secret=process.env.PROCESSOR_SHARED_SECRET??"local-development-only";
  const response=await fetch(`${base.replace(/\/$/,"")}/internal/v1/process-next`,{method:"POST",headers:{"content-type":"application/json","x-processor-secret":secret},cache:"no-store",signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw new Error("DOCUMENT_PROCESSOR_UNAVAILABLE");
  const body=await response.json() as {state?:string};return body.state??"unknown";
}
