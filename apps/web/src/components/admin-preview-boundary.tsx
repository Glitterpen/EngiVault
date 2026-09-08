"use client";

import {Eye,LockKeyhole} from "lucide-react";
import {useRouter} from "next/navigation";
import {useEffect,useRef} from "react";
import {scopedRoleLabel} from "@/lib/role-experience";

type Preview={organisationId:string;projectId:string;role:"project_admin"|"document_controller"|"engineer";displayName:string;disciplines:string[];expiresAt:string};

export function AdminPreviewBoundary({preview,children}:{preview:Preview|null;children:React.ReactNode}){
  const router=useRouter();const content=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!preview)return;
    const refresh=()=>{if(document.visibilityState==='visible')router.refresh()};
    const timer=window.setInterval(refresh,30000);window.addEventListener('focus',refresh);
    // UX lock only. The server and read gateway independently reject changes.
    const lock=()=>content.current?.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('button,input,select,textarea').forEach(control=>{
      if(!control.closest('[data-preview-safe]')&&control.form?.getAttribute('method')?.toLowerCase()!=='get'){control.disabled=true;control.title='Read-only member preview'}
    });
    lock();const observer=new MutationObserver(lock);if(content.current)observer.observe(content.current,{childList:true,subtree:true});
    return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);observer.disconnect()};
  },[preview,router]);
  if(!preview)return children;
  return <>
    <section className="border-b border-[#f1c5ad] bg-[#fff5ee] px-5 py-3 lg:px-8" role="status">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e8733f] text-white"><Eye size={17}/></span><div><p className="text-sm font-bold text-[#7b321e]">Live read-only preview: {preview.displayName} · {scopedRoleLabel(preview.role,preview.disciplines)}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8a5a4b]"><LockKeyhole size={12}/> You remain the administrator. Changes are blocked; this session is audited. Refreshes every 30 seconds.</p></div></div>
        <button className="ev-button-secondary" type="button" onClick={()=>router.refresh()}>Refresh live data</button>
        <form action="/api/admin-preview/exit" method="post"><button className="ev-button-secondary" type="submit">Exit role preview</button></form>
      </div>
    </section>
    <div ref={content} aria-label="Read-only member preview" onSubmitCapture={event=>{if(!event.target || !(event.target instanceof HTMLFormElement)||!event.target.closest('[data-preview-safe]')&&event.target.getAttribute('method')?.toLowerCase()!=='get'){event.preventDefault();event.stopPropagation()}}}>{children}</div>
  </>;
}
