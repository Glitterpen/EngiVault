"use client";
import {useEffect,useId,useRef,useState} from "react";
import {X} from "lucide-react";

// Native modal semantics contain focus and restore it to the opener.
export function AppDialog({trigger,title,children,primary=false}:{trigger:React.ReactNode;title:string;children:React.ReactNode;primary?:boolean}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const opener=useRef<HTMLButtonElement>(null);
 const id=useId();
 const [open,setOpen]=useState(false);
 const [hasOpened,setHasOpened]=useState(false);
 useEffect(()=>{if(!open)return;const previous=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{document.body.style.overflow=previous;};},[open]);
 return <>
  <button ref={opener} type="button" className={primary?"ev-button":"ev-button-secondary"} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={()=>{setOpen(true);setHasOpened(true);dialog.current?.showModal();}}>{trigger}</button>
  <dialog ref={dialog} id={id} aria-labelledby={`${id}-title`} onClose={()=>{setOpen(false);opener.current?.focus();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}} className="m-auto max-h-[90dvh] w-[min(94vw,620px)] overflow-hidden rounded-2xl border border-[#dce2e9] bg-white p-0 text-[#10243e] shadow-2xl backdrop:bg-[#10243e]/65">
   <header className="flex items-center justify-between gap-3 border-b border-[#dfe7e3] px-5 py-3"><h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2><button type="button" aria-label={`Close ${title.toLowerCase()}`} className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#dce2e9]" onClick={()=>dialog.current?.close()}><X size={18}/></button></header>
   <div className="max-h-[calc(90dvh-76px)] overflow-y-auto overscroll-contain p-5 sm:p-6">{hasOpened&&children}</div>
  </dialog>
 </>;
}
