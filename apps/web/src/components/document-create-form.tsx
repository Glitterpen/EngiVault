"use client";

import {FormField} from "@/components/form-field";
import {FormFeedback} from "@/components/form-feedback";
import { useActionState } from "react";
import { disciplineLabel } from "@/lib/project-disciplines";
import { DocumentTypeInput } from "@/components/document-type-input";
import { FilePlus2 } from "lucide-react";
import { createDocument, type MutationState } from "@/app/app/actions";

type Category={code:string;name:string};

export function DocumentCreateForm({organisationId,projectId,disciplines,documentTypes,bare=false}:{organisationId:string;projectId:string;disciplines:Category[];documentTypes:Category[];bare?:boolean}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createDocument,undefined);
  return <form action={action} aria-label="Register document" aria-busy={pending} className={bare?"min-w-0":"ev-card min-w-0 p-6"}><input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId}/><div className="flex items-center gap-2"><FilePlus2 size={18} className="text-[#e8733f]" aria-hidden="true"/><h2 className="font-semibold">Register document</h2></div><Field n="documentNumber" l="Document number" p="EC-PIP-001"/><Field n="title" l="Title"/><DocumentTypeInput suggestions={documentTypes}/><Select n="discipline" l="Discipline" items={disciplines}/><DateField/><Field n="area" l="Area (optional)" p="Utilities" optional/><Field n="system" l="System (optional)" p="Crude transfer" optional/><Field n="workPackage" l="Work package (optional)" p="WP-03" optional/>{state?.message&&<FormFeedback tone="error" className="mt-4">{state.message}</FormFeedback>}<button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Registering…":"Create document"}</button></form>;
}

function Field({n,l,p,optional=false}:{n:string;l:string;p?:string;optional?:boolean}){return <FormField className="mt-4" label={l}><input className="ev-input min-h-11 min-w-0" name={n} placeholder={p} required={!optional}/></FormField>}
function Select({n,l,items}:{n:string;l:string;items:Category[]}){return <FormField className="mt-4" label={l}><select className="ev-input min-h-11 min-w-0" name={n} required defaultValue=""><option value="" disabled>Select {l.toLowerCase()}</option>{items.map(item=><option key={item.name} value={item.name}>{disciplineLabel(item)}</option>)}</select></FormField>}
function DateField(){return <FormField className="mt-4" label="Agreed submission date" help={{label:"First-submission date",content:"Enter the agreed date for the engineer’s first submission. This date sets the initial deadline and overdue reminders."}}><input className="ev-input min-h-11 min-w-0" type="date" name="plannedSubmissionDate" required/></FormField>}
