"use client";

import Image from "next/image";
import {useActionState,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Building2,ImagePlus,Trash2} from "lucide-react";
import {deleteOrganisation,setDocumentArchived,setOrganisationArchived,setProjectArchived,updateDocument,updateOrganisation,updateProject,type MutationState} from "@/app/app/actions";
import {ProjectLogo} from "@/components/project-logo";

export function OrganisationAdminForm({record}:{record:{id:string;name:string;slug:string;status:string;logoUrl:string|null}}){
 const [state,action,pending]=useActionState<MutationState,FormData>(updateOrganisation,undefined);
 const router=useRouter();
 const [temporaryPreview,setTemporaryPreview]=useState("");
 const [failedPreview,setFailedPreview]=useState("");
 const handledMutation=useRef("");
 useEffect(()=>()=>{if(temporaryPreview)URL.revokeObjectURL(temporaryPreview)},[temporaryPreview]);
 useEffect(()=>{
  if(!state?.mutationId||handledMutation.current===state.mutationId)return;
  handledMutation.current=state.mutationId;
  router.refresh();
 },[state?.mutationId,router]);
 const savedLogoUrl=state?.logoVersion&&record.logoUrl?`${record.logoUrl}${record.logoUrl.includes("?")?"&":"?"}v=${encodeURIComponent(state.logoVersion)}`:record.logoUrl??"";
 const preview=temporaryPreview||savedLogoUrl;
 function selectLogo(file:File|null){if(temporaryPreview)URL.revokeObjectURL(temporaryPreview);setTemporaryPreview(file?URL.createObjectURL(file):"")}
 return <div className="space-y-5">
  <form action={action} className="ev-card p-6">
   <input type="hidden" name="organisationId" value={record.id}/>
   <h2 className="font-semibold">Edit organisation</h2>
   <p className="mt-2 text-sm text-[#617083]">Update the company identity shown to authorised project teams.</p>
   <div className="mt-5 flex flex-wrap items-center gap-4">
    <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white text-[#e8733f] shadow-sm">{preview&&failedPreview!==preview?<Image unoptimized src={preview} alt={`${record.name} logo`} width={80} height={80} onError={()=>setFailedPreview(preview)} className="size-full object-contain p-2"/>:<Building2 size={28}/>}</span>
    <label className="ev-button-secondary cursor-pointer"><ImagePlus size={16}/> Replace company logo<input className="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp" onChange={event=>selectLogo(event.target.files?.[0]??null)}/></label>
    <p className="text-xs text-[#617083]">Optional · PNG, JPEG or WebP · maximum 2 MB</p>
   </div>
   <Field name="name" label="Organisation name" value={record.name}/>
   <Field name="slug" label="URL slug" value={record.slug}/>
   {state?.message&&<p className="mt-3 rounded-lg bg-[#f3f7f5] p-3 text-sm text-[#0c5b45]" role="status">{state.message}{state.mutationId&&" The refreshed identity is now shown throughout the workspace."}</p>}
   <button className="ev-button mt-5" disabled={pending}>{pending?"Saving…":"Save organisation changes"}</button>
  </form>
  <Lifecycle action={setOrganisationArchived} ids={{organisationId:record.id}} archived={record.status==="suspended"} subject="organisation"/>
  <DeleteOrganisation record={record}/>
 </div>
}

export function ProjectAdminForm({record}:{record:{id:string;organisation_id:string;code:string;name:string;description:string|null;status:string;client_name:string|null;facility_location:string|null;client_logo_paths:string[]}}){
 const [state,action,pending]=useActionState<MutationState,FormData>(updateProject,undefined);
 const [logoPreviews,setLogoPreviews]=useState<string[]>([]);
 const [logoCount,setLogoCount]=useState(0);
 useEffect(()=>()=>logoPreviews.forEach(url=>URL.revokeObjectURL(url)),[logoPreviews]);
 function chooseLogos(files:FileList|null){const selected=Array.from(files??[]);setLogoCount(selected.length);setLogoPreviews(selected.slice(0,3).map(file=>URL.createObjectURL(file)))}
 const tooManyLogos=logoCount>3;
 return <div className="space-y-5"><form action={action} className="ev-card p-6">
  <input type="hidden" name="organisationId" value={record.organisation_id}/><input type="hidden" name="projectId" value={record.id}/>
  <h2 className="font-semibold">Project and client identity</h2><p className="mt-2 text-sm text-[#617083]">The first client logo is used automatically as the project icon.</p>
  <div className="mt-5 flex flex-wrap items-center gap-4">
   {logoPreviews.length?<div className="flex flex-wrap gap-2">{logoPreviews.map((src,index)=><span key={src} className="grid size-16 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-white p-1.5"><Image unoptimized src={src} alt={`Replacement client logo ${index+1}`} width={52} height={52} className="size-full object-contain"/></span>)}</div>:<span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white p-2 text-[#e8733f] shadow-sm"><ProjectLogo organisationId={record.organisation_id} projectId={record.id} name={record.name} size={80} version={state?.logoVersion} className="size-full object-contain"/></span>}
   <label className="ev-button-secondary cursor-pointer"><ImagePlus size={16}/> Replace client logos<input className="sr-only" type="file" name="clientLogos" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>chooseLogos(event.target.files)}/></label>
   <p className="text-xs text-[#617083]">Optional · up to 3 · maximum 2 MB each</p>
  </div>
  {tooManyLogos&&<p className="mt-2 text-xs font-semibold text-[#a5452f]" role="alert">Choose no more than three client logos.</p>}
  <Field name="code" label="Project code" value={record.code}/><Field name="name" label="Project name" value={record.name}/><Field name="clientName" label="Client name" value={record.client_name??""}/><Field name="facility" label="Facility / location" value={record.facility_location??""} optional/><Field name="description" label="Description" value={record.description??""} optional/>
  {state?.message&&<p className="mt-3 rounded-lg bg-[#f3f7f5] p-3 text-sm text-[#0c5b45]" role="status">{state.message}</p>}
  <button className="ev-button mt-5" disabled={pending||tooManyLogos}>{pending?"Saving…":"Save project identity"}</button>
 </form><Lifecycle action={setProjectArchived} ids={{organisationId:record.organisation_id,projectId:record.id}} archived={record.status==="archived"} subject="project"/></div>
}

export function DocumentAdminForm({record}:{record:{id:string;organisation_id:string;project_id:string;document_number:string;title:string;document_type:string;discipline:string;area:string|null;system:string|null;work_package:string|null;lifecycle_status:string}}){const [state,action,pending]=useActionState<MutationState,FormData>(updateDocument,undefined);return <div className="space-y-5"><form action={action} className="ev-card p-6"><input type="hidden" name="organisationId" value={record.organisation_id}/><input type="hidden" name="projectId" value={record.project_id}/><input type="hidden" name="documentId" value={record.id}/><h2 className="font-semibold">Document metadata</h2><Field name="documentNumber" label="Document number" value={record.document_number}/><Field name="title" label="Title" value={record.title}/><Field name="documentType" label="Document type" value={record.document_type}/><Field name="discipline" label="Discipline" value={record.discipline}/><Field name="area" label="Area" value={record.area??""} optional/><Field name="system" label="System" value={record.system??""} optional/><Field name="workPackage" label="Work package" value={record.work_package??""} optional/>{state?.message&&<p className="mt-3 text-sm">{state.message}</p>}<button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Saving…":"Save metadata"}</button></form><Lifecycle action={setDocumentArchived} ids={{organisationId:record.organisation_id,projectId:record.project_id,documentId:record.id}} archived={record.lifecycle_status==="archived"} subject="document"/></div>}

function Field({name,label,value,optional=false}:{name:string;label:string;value:string;optional?:boolean}){return <label className="mt-4 block"><span className="ev-label">{label}</span><input className="ev-input" name={name} defaultValue={value} required={!optional}/></label>}

function Lifecycle({action,ids,archived,subject}:{action:(data:FormData)=>Promise<void>;ids:Record<string,string>;archived:boolean;subject:string}){return <form action={action} className="ev-card border-[#efc6b4] p-6">{Object.entries(ids).map(([name,value])=><input key={name} type="hidden" name={name} value={value}/>)}<input type="hidden" name="archived" value={String(!archived)}/><h2 className="font-semibold">{archived?`Restore ${subject}`:`Archive ${subject}`}</h2><p className="mt-2 text-sm text-[#617083]">{archived?"Return this record to active workspace views.":"Hide this record from active work while preserving its history and audit evidence."}</p><button className="ev-button-secondary mt-4">{archived?"Restore":"Archive"}</button></form>}

function DeleteOrganisation({record}:{record:{id:string;name:string}}){
 const [state,action,pending]=useActionState<MutationState,FormData>(deleteOrganisation,undefined);
 const [confirmation,setConfirmation]=useState("");
 const [acknowledged,setAcknowledged]=useState(false);
 const ready=confirmation===record.name&&acknowledged;
 return <form action={action} className="ev-card border-[#ef9b8a] bg-[#fffafa] p-6">
  <input type="hidden" name="organisationId" value={record.id}/>
  <div className="flex items-center gap-2 text-[#a53724]"><Trash2 size={18}/><h2 className="font-semibold">Delete organisation</h2></div>
  <p className="mt-2 text-sm leading-6 text-[#6f4b45]">This permanently removes the organisation from every member’s workspace and disables its projects, invitations and file access. Engineering records and audit evidence are retained securely for recovery or compliance.</p>
  <label className="mt-4 block"><span className="ev-label">Type <strong>{record.name}</strong> to confirm</span><input className="ev-input" name="confirmationName" value={confirmation} onChange={event=>setConfirmation(event.target.value)} autoComplete="off" required/></label>
  <label className="mt-4 flex items-start gap-3 text-sm text-[#6f4b45]"><input className="mt-1" type="checkbox" name="acknowledge" value="yes" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} required/><span>I understand that organisation members will immediately lose access.</span></label>
  {state?.message&&<p className="mt-3 text-sm text-[#a53724]" role="alert">{state.message}</p>}
  <button type="submit" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#a53724] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#7f281b] disabled:cursor-not-allowed disabled:opacity-40" disabled={pending||!ready}><Trash2 size={16}/>{pending?"Deleting…":"Delete organisation"}</button>
 </form>
}
