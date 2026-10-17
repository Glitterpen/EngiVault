"use client";

import {type ReactNode,useId,useRef,useState} from "react";
import {ChevronDown} from "lucide-react";

/** One daily action on mobile; the same secondary controls stay inline on desktop. */
export function MdrActionToolbar({primary,children}:{primary:ReactNode;children:ReactNode}){
  const id=useId();
  const trigger=useRef<HTMLButtonElement>(null);
  const [expanded,setExpanded]=useState(false);
  return <nav aria-label="MDR actions" className="mt-3 flex min-w-0 flex-wrap items-start gap-2">
    <div className="min-w-0 [&>button]:w-full [&>a]:w-full sm:[&>button]:w-auto sm:[&>a]:w-auto">{primary}</div>
    <button ref={trigger} type="button" data-preview-safe aria-label="More MDR tools" aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)} className="ev-button-secondary min-h-11 sm:hidden">
      More tools <ChevronDown size={16} aria-hidden="true" className={`shrink-0 ${expanded?"rotate-180":""}`}/>
    </button>
    <div id={id} className={`${expanded?"flex":"hidden"} w-full min-w-0 flex-col gap-2 rounded-xl border border-[#dfe6eb] bg-[#f6f8fa] p-2 sm:flex sm:w-auto sm:flex-1 sm:flex-row sm:flex-wrap sm:border-0 sm:bg-transparent sm:p-0`}
      onKeyDown={event=>{
        if(event.key!=="Escape"||!expanded||(event.target as HTMLElement).closest("dialog"))return;
        event.preventDefault();event.stopPropagation();setExpanded(false);trigger.current?.focus();
      }}>
      {children}
    </div>
  </nav>;
}
