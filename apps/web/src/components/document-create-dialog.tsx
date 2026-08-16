"use client";

import { useRef } from "react";
import { ChevronDown, FilePlus2, X } from "lucide-react";
import { DocumentCreateForm } from "@/components/document-create-form";

type Category={code:string;name:string};

export function DocumentCreateDialog({organisationId,projectId,disciplines,documentTypes}:{organisationId:string;projectId:string;disciplines:Category[];documentTypes:Category[]}){
  const panel=useRef<HTMLDetailsElement>(null);
  return <details ref={panel} className="group relative"><summary className="ev-button inline-flex cursor-pointer list-none items-center gap-2 px-4"><FilePlus2 size={16}/> Register document <ChevronDown size={15} className="transition group-open:rotate-180"/></summary><section aria-label="Register a new document" className="fixed inset-x-3 bottom-3 top-20 z-50 overflow-hidden rounded-2xl border border-[#dce2e9] bg-white text-[#10243e] shadow-[0_28px_90px_rgba(16,36,62,.32)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[min(620px,calc(100vw-3rem))]"><div className="flex items-center justify-between border-b border-[#dfe7e3] bg-white px-5 py-4"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Master document register</p><p className="mt-1 text-sm text-[#617083]">Add a planned deliverable and its agreed submission date.</p></div><button type="button" onClick={()=>{if(panel.current)panel.current.open=false}} className="grid size-9 place-items-center rounded-lg border border-[#dce2e9] text-[#617083] hover:border-[#e8733f] hover:text-[#e8733f]" aria-label="Collapse document form"><X size={16}/></button></div><div className="h-[calc(100%_-_73px)] overflow-y-auto p-5 sm:h-auto sm:max-h-[calc(90vh-130px)] sm:p-6"><DocumentCreateForm organisationId={organisationId} projectId={projectId} disciplines={disciplines} documentTypes={documentTypes} bare/></div></section></details>;
}
