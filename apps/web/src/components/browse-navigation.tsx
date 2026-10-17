import Link from "next/link";
import {browseHref} from "@/lib/read-only-browse";

/** Read-only GET navigation. Existing server access checks still run per page. */
export function BrowseNavigation({path,query={},page,pages,total,count,label}:{path:string;query?:Record<string,string|number|undefined>;page:number;pages:number;total:number;count:number;label:string}){
  const start=total?(page-1)*25+1:0,end=total?start+count-1:0;
  return <nav data-preview-safe aria-label={`${label} pages`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3 text-sm">
    <p role="status" aria-live="polite" aria-atomic="true" className="text-xs leading-5 text-[#526675]">{total?`Showing ${start}–${end} of ${total} matching ${label.toLowerCase()}`:`0 matching ${label.toLowerCase()}`} · Page {page} of {pages}</p>
    {pages>1&&<div className="flex gap-2">{page>1?<Link className="ev-button-secondary" href={browseHref(path,{...query,page:page-1})} aria-label={`Previous ${label.toLowerCase()} page`}>Previous</Link>:<span aria-disabled="true" className="ev-button-secondary opacity-50">Previous</span>}{page<pages?<Link className="ev-button-secondary" href={browseHref(path,{...query,page:page+1})} aria-label={`Next ${label.toLowerCase()} page`}>Next</Link>:<span aria-disabled="true" className="ev-button-secondary opacity-50">Next</span>}</div>}
  </nav>;
}
