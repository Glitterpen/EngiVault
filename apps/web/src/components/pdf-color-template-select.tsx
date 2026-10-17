"use client";

import {useId,useState} from "react";
import {PDF_COLOR_TEMPLATES,pdfColorTemplate,type PdfColorTemplate} from "@/lib/pdf-color-template";

export function PdfColorTemplateSelect({defaultValue="neutral",value,onValueChange,disabled=false,label="PDF colour template",description="Applies to this new document only. Existing issued documents keep their saved template."}:{defaultValue?:unknown;value?:PdfColorTemplate;onValueChange?:(value:PdfColorTemplate)=>void;disabled?:boolean;label?:string;description?:string}){
  const id=useId();
  const [localValue,setLocalValue]=useState(()=>pdfColorTemplate(defaultValue).id);
  const selected=value??localValue;
  const template=pdfColorTemplate(selected);
  function changeTemplate(rawValue:string){
    const next=pdfColorTemplate(rawValue).id;
    if(value===undefined)setLocalValue(next);
    onValueChange?.(next);
  }
  return <div className="min-w-0">
    <label htmlFor={id} className="ev-label" style={{color:"inherit"}}>{label}</label>
    <div className="flex min-w-0 items-center gap-3">
      <select id={id} name="pdfColorTemplate" className="ev-input min-w-0 flex-1 bg-white text-[#24384f]" value={selected} onChange={event=>changeTemplate(event.target.value)} disabled={disabled} aria-describedby={`${id}-description`}>
        {PDF_COLOR_TEMPLATES.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
      <span aria-hidden="true" className="flex h-9 w-12 shrink-0 overflow-hidden rounded-md border border-[#b8c4d1]">
        <span className="w-2/3" style={{backgroundColor:`rgb(${template.palette.header.join(",")})`}}/>
        <span className="w-1/3" style={{backgroundColor:`rgb(${template.palette.accent.join(",")})`}}/>
      </span>
    </div>
    <p id={`${id}-description`} className="mt-2 text-xs leading-5 opacity-80">{description}</p>
  </div>;
}
