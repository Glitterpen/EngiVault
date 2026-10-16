"use client";
import { customerErrorMessage } from "@/lib/customer-messages";


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
      setError(customerErrorMessage(cause,"The project report could not be downloaded."));
    }finally{setPreparing(false)}
  }

  return <div className="flex min-w-0 w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
    <a className="ev-button min-h-11" href={href} onClick={event=>void download(event)} aria-disabled={preparing} aria-busy={preparing}>
      {preparing?<LoaderCircle className="shrink-0 animate-spin motion-reduce:animate-none" size={16} aria-hidden="true"/>:<Download size={16} aria-hidden="true"/>}
      {preparing?"Preparing PDF…":"Download PDF"}
    </a>
    {error?<p className="max-w-xs break-words text-xs font-semibold leading-5 text-[#a5452f] sm:text-right" role="alert">{error} Try again.</p>:null}
  </div>;
}
