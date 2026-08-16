"use client";

import {Download,LoaderCircle} from "lucide-react";
import {useState,type MouseEvent} from "react";

export function PrintReportButton({href}:{href:string}){
  const [preparing,setPreparing]=useState(false);
  const [error,setError]=useState("");

  async function download(event:MouseEvent<HTMLAnchorElement>){
    event.preventDefault();
    if(preparing)return;
    setPreparing(true);setError("");
    try{
      const response=await fetch(href,{cache:"no-store",credentials:"same-origin"});
      if(!response.ok){
        const payload=await response.json().catch(()=>null) as {error?:{message?:string}}|null;
        throw new Error(payload?.error?.message||"The project report could not be prepared.");
      }
      const blob=await response.blob();
      if(!blob.size)throw new Error("The generated PDF was empty.");
      const disposition=response.headers.get("content-disposition")??"";
      const filename=disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim()||"EngiCite-project-report.pdf";
      const objectUrl=URL.createObjectURL(blob);
      const anchor=document.createElement("a");
      anchor.href=objectUrl;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1_000);
    }catch(cause){
      setError(cause instanceof Error?cause.message:"The project report could not be downloaded.");
    }finally{setPreparing(false)}
  }

  return <div className="flex flex-col items-end gap-1">
    <a className="ev-button" href={href} onClick={event=>void download(event)} aria-disabled={preparing} aria-busy={preparing}>
      {preparing?<LoaderCircle className="animate-spin" size={16}/>:<Download size={16}/>}
      {preparing?"Preparing PDF…":"Download PDF"}
    </a>
    {error?<p className="max-w-xs text-right text-xs font-semibold text-[#a5452f]" role="alert">{error} Try again.</p>:null}
  </div>;
}
