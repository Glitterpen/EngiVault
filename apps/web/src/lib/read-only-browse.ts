/** URL state only. No authorisation, database client or record mutations live here. */
export type BrowseQuery=Record<string,string|string[]|undefined>;
export const BROWSE_PAGE_SIZE=25;
export const MAX_BROWSE_INDEX_ROWS=50000;
export function browseValue(value:string|string[]|undefined){return Array.isArray(value)?value[0]??"":value??"";}
export function browseSearch(value:string|string[]|undefined){return browseValue(value).replace(/[,%()"\\\u0000-\u001f\u007f]/g,"").trim().slice(0,100);}
export function browseTextFilter(search:string,columns:readonly string[]){return columns.map(column=>`${column}.ilike.%${browseSearch(search)}%`).join(",");}
export function browsePage(value:string|string[]|undefined){const text=browseValue(value);const page=Number(text);return /^\d+$/.test(text)&&Number.isSafeInteger(page)&&page>0&&page<=1000000?page:1;}
export function browseHref(path:string,query:Record<string,string|number|undefined>){
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query))if(value!==undefined&&value!==""&&!(key==="page"&&value===1))params.set(key,String(value));
  return `${path}${params.size?`?${params}`:""}`;
}
type Result<T>={data:T[]|null;error:unknown;count?:number|null};
type Read<T>=(start:number,end:number)=>PromiseLike<Result<T>>;
function total(value:number|null|undefined):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}

/** Advance by rows actually returned, including installations with lower API caps. */
export async function readBrowseIndex<T extends {id:string}>(read:Read<T>):Promise<T[]>{
  const rows:T[]=[],seen=new Set<string>();let expected:number|undefined;
  for(;;){
    const result=await read(rows.length,rows.length+499);
    if(result.error||!Array.isArray(result.data)||!total(result.count)||(expected!==undefined&&expected!==result.count))throw new Error("Browse unavailable");
    expected=result.count;
    if(expected>MAX_BROWSE_INDEX_ROWS)throw new Error("Browse unavailable");
    if(result.data.length>500||(!result.data.length&&rows.length<expected))throw new Error("Browse unavailable");
    for(const row of result.data){if(!row||typeof row.id!=="string"||seen.has(row.id))throw new Error("Browse unavailable");seen.add(row.id);rows.push(row);}
    if(rows.length>expected)throw new Error("Browse unavailable");
    if(rows.length===expected)return rows;
  }
}
export function sliceBrowsePage<T>(rows:T[],requested:number,size=BROWSE_PAGE_SIZE){
  const pages=Math.max(1,Math.ceil(rows.length/size)),page=Math.min(requested,pages),start=(page-1)*size;
  return {items:rows.slice(start,start+size),total:rows.length,page,pages,start};
}
/** Exact count and bounded rows; never mistake a provider cap/read failure for empty. */
export async function readBrowsePage<T>(read:Read<T>,requested:number,size=BROWSE_PAGE_SIZE){
  let page=requested,start=(page-1)*size;
  let result=await read(start,start+size-1);
  // PostgREST returns PGRST103 with no count for a range beyond the last row.
  // Probe only the same scoped read; unrelated errors must remain unavailable.
  if(start>0&&result.error&&typeof result.error==="object"&&"code" in result.error&&result.error.code==="PGRST103"){
    result=await read(0,size-1);
    if(result.error||!Array.isArray(result.data)||!total(result.count)||result.data.length!==Math.min(size,result.count)||requested<=Math.max(1,Math.ceil(result.count/size)))throw new Error("Browse unavailable");
    page=1;start=0;
  }
  if(result.error||!Array.isArray(result.data)||!total(result.count))throw new Error("Browse unavailable");
  const count=result.count,pages=Math.max(1,Math.ceil(count/size));
  const clamped=Math.min(requested,pages);
  if(page!==clamped){page=clamped;start=(page-1)*size;result=await read(start,start+size-1);}
  if(result.error||!Array.isArray(result.data)||result.count!==count||result.data.length!==Math.min(size,Math.max(0,count-start)))throw new Error("Browse unavailable");
  return {items:result.data,total:count,page,pages,start};
}
