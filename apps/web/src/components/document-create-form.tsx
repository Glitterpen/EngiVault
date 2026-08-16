"use client";

import { useActionState } from "react";
import { FilePlus2 } from "lucide-react";
import { createDocument, type MutationState } from "@/app/app/actions";

type Category={code:string;name:string};

export function DocumentCreateForm({organisationId,projectId,disciplines,documentTypes,bare=false}:{organisationId:string;projectId:string;disciplines:Category[];documentTypes:Category[];bare?:boolean}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createDocument,undefined);
  return <form action={action} className={bare?"":"ev-card p-6"}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><div className="flex items-center gap-2"><FilePlus2 size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Register document</h2></div><Field n="documentNumber" l="Document number" p="EC-PIP-001"/><Field n="title" l="Title"/><Select n="documentType" l="Document type" items={documentTypes}/><Select n="discipline" l="Discipline" items={disciplines}/><DateField/><Field n="area" l="Area (optional)" p="Utilities" optional/><Field n="system" l="System (optional)" p="Crude transfer" optional/><Field n="workPackage" l="Work package (optional)" p="WP-03" optional/>{state?.message&&<p className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">{state.message}</p>}<button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Registering…":"Create document"}</button><p className="mt-3 text-xs leading-5 text-[#617083]">The assigned discipline engineers and DCC will be reminded if no revision is received by this date.</p></form>;
}

function Field({n,l,p,optional=false}:{n:string;l:string;p?:string;optional?:boolean}){return <label className="mt-4 block"><span className="ev-label">{l}</span><input className="ev-input" name={n} placeholder={p} required={!optional}/></label>}
function Select({n,l,items}:{n:string;l:string;items:Category[]}){return <label className="mt-4 block"><span className="ev-label">{l}</span><select className="ev-input" name={n} required defaultValue=""><option value="" disabled>Select {l.toLowerCase()}</option>{items.map(item=><option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}</select></label>}
function DateField(){return <label className="mt-4 block"><span className="ev-label">Agreed submission date</span><input className="ev-input" type="date" name="plannedSubmissionDate" required/><span className="mt-1 block text-xs leading-5 text-[#617083]">Date communicated by the originating engineer for first submission.</span></label>}
