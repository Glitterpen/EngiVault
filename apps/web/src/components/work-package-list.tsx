"use client";

import {useId,useState} from "react";
import Link from "next/link";
import {ArrowRight,Package,Search,Send} from "lucide-react";

export type WorkPackageListItem={id:string;package_number:string;name:string;version:number;state:string;destination:string;manifest:{kind?:string;recipient?:{company?:string}}|null;created_at:string};
type View="all"|"transmittals"|"packages";

export function WorkPackageList({organisationId,projectId,packages}:{organisationId:string;projectId:string;packages:WorkPackageListItem[]}){
  const id=useId();
  const [search,setSearch]=useState("");
  const [view,setView]=useState<View>("all");
  const query=search.trim().toLocaleLowerCase();
  const isTransmittal=(item:WorkPackageListItem)=>item.manifest?.kind==="document_transmittal";
  const visible=packages.filter(item=>(view==="all"||(view==="transmittals"?isTransmittal(item):!isTransmittal(item)))&&
    `${item.package_number} ${item.name} ${item.manifest?.recipient?.company??""} ${item.state} ${isTransmittal(item)?"client transmittal":"work package"}`.toLocaleLowerCase().includes(query));
  const transmittals=packages.filter(isTransmittal).length;
  return <section aria-labelledby={`${id}-heading`} className="ev-card min-w-0 overflow-hidden">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-heading`} className="text-base font-semibold">Package history</h2><p className="text-xs text-[#526675]">Most recent first</p></header>
    <div data-preview-safe className="min-w-0 space-y-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5">
      <label htmlFor={`${id}-search`} className="ev-label">Search transmittals and packages</label><div className="relative min-w-0"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#526675]"/><input id={`${id}-search`} type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Number, package name or recipient" className="ev-input min-w-0 pl-10"/></div>
      <nav aria-label="Package type" className="flex min-w-0 flex-wrap gap-1">{([["all","All",packages.length],["transmittals","Transmittals",transmittals],["packages","Work packages",packages.length-transmittals]] as const).map(([key,label,count])=><button key={key} type="button" aria-pressed={view===key} onClick={()=>setView(key)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${view===key?"bg-[#eef3fa] text-[#10243e]":"text-[#526675] hover:bg-[#f5f7f9]"}`}>{label}{" "}<span className="text-xs font-normal">{count}</span></button>)}</nav>
      <p role="status" className="text-xs text-[#526675]">{visible.length} of {packages.length} records</p>
    </div>
    <ul aria-label="Transmittals and work packages" className="divide-y divide-[#e7ecef]">{visible.map(item=>{
      const transmittal=isTransmittal(item);
      return <li key={item.id} className="min-w-0"><Link href={`/app/${organisationId}/projects/${projectId}/work-packages/${item.id}`} className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_1rem] items-start gap-3 px-4 py-4 transition-colors hover:bg-[#f8fafb] focus-visible:outline-offset-[-3px] motion-reduce:transition-none sm:px-5">
        <span className={`mt-0.5 grid size-8 place-items-center rounded-lg ${transmittal?"bg-[#eef3fa] text-[#10243e]":"bg-[#edf2f8] text-[#244b73]"}`}>{transmittal?<Send size={17} aria-hidden="true"/>:<Package size={18} aria-hidden="true"/>}</span>
        <div className="min-w-0"><div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h3 className="min-w-0 max-w-full text-sm font-semibold text-[#14263d] [overflow-wrap:anywhere]">{item.package_number}</h3><span className="text-xs text-[#526675]">V{item.version}</span>{" "}<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.state==="ready"?"bg-[#eef3fa] text-[#10243e]":item.state==="failed"?"bg-[#fff0e9] text-[#a5452f]":"bg-[#f0f3f6] text-[#405566]"}`}>{packageStateLabel(item.state,transmittal)}</span></div>
          <p className="mt-1 break-words text-sm text-[#405566]">{transmittal?"Client document transmittal":item.name}</p><p className="mt-1 break-words text-xs leading-5 text-[#526675]">{transmittal?`To ${item.manifest?.recipient?.company??"client"}`:item.destination.replaceAll("_"," ")}{" "}<span className="mx-1.5" aria-hidden="true">·</span>{" "}<time dateTime={item.created_at}>{formatDate(item.created_at)}</time></p></div><ArrowRight size={16} aria-hidden="true" className="mt-2 text-[#526675]"/>
      </Link></li>;
    })}</ul>
    {!visible.length&&<div className="p-6 text-center sm:p-8"><Package size={23} aria-hidden="true" className="mx-auto text-[#657889]"/><p className="mt-3 text-sm text-[#526675]">{packages.length?"No transmittals or packages match your search and category.":"No transmittals or work packages created yet."}</p>{packages.length>0&&<button type="button" data-preview-safe className="ev-button-secondary mt-3 min-h-11 w-full sm:w-auto" onClick={()=>{setSearch("");setView("all");}}>Clear search and category</button>}</div>}
  </section>;
}

function packageStateLabel(state:string,transmittal:boolean){if(state==="ready")return transmittal?"Transmittal generated":"Ready to download";if(state==="frozen")return "Frozen · awaiting ZIP";if(state==="generating")return "Preparing ZIP";if(state==="failed")return "Generation failed";return state.replaceAll("_"," ");}
function formatDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"Date unavailable":date.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});}
