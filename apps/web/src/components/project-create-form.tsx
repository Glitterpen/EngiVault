"use client";

import Image from "next/image";
import Link from "next/link";
import {useActionState,useEffect,useState} from "react";
import {Building2,ImagePlus,MapPin,Plus} from "lucide-react";
import {createProject,type MutationState} from "@/app/app/actions";

export function ProjectCreateForm({organisationId}:{organisationId:string}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createProject,undefined);
  const [logoPreviews,setLogoPreviews]=useState<string[]>([]);
  const [logoCount,setLogoCount]=useState(0);

  useEffect(()=>()=>logoPreviews.forEach(url=>URL.revokeObjectURL(url)),[logoPreviews]);

  function chooseLogos(files:FileList|null){
    const selected=Array.from(files??[]);
    setLogoCount(selected.length);
    setLogoPreviews(selected.slice(0,3).map(file=>URL.createObjectURL(file)));
  }

  const tooManyLogos=logoCount>3;
  return <form action={action} className="ev-card h-fit p-6">
    <input type="hidden" name="organisationId" value={organisationId}/>
    <div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Create project</h2></div>
    <p className="mt-2 text-xs leading-5 text-[#617083]">Set the project and client identity used across its workspace and reports.</p>

    <label className="mt-6 block"><span className="ev-label">Project code</span><input className="ev-input" name="code" placeholder="ENG-001" required/></label>
    <label className="mt-4 block"><span className="ev-label">Project name</span><input className="ev-input" name="name" required/></label>
    <label className="mt-4 block">
      <span className="ev-label">Client name</span>
      <span className="relative block"><Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#879389]" size={16}/><input className="ev-input pl-10" name="clientName" placeholder="Client organisation" required/></span>
    </label>
    <label className="mt-4 block">
      <span className="ev-label">Facility / location <span className="font-normal normal-case tracking-normal text-[#879389]">(optional)</span></span>
      <span className="relative block"><MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#879389]" size={16}/><input className="ev-input pl-10" name="facility" placeholder="e.g. Bonny Island LNG Facility"/></span>
    </label>

    <div className="mt-5">
      <span className="ev-label">Client logos <span className="font-normal normal-case tracking-normal text-[#879389]">(optional, up to 3)</span></span>
      <label className="mt-2 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#b8c9c1] bg-[#f8fbf9] p-3 transition hover:border-[#0c5b45] hover:bg-[#f1f7f4]">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white text-[#e8733f] shadow-sm"><ImagePlus size={19}/></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-[#0c5b45]">Choose client logo files</span><span className="mt-0.5 block text-xs text-[#617083]">PNG, JPEG or WebP; maximum 2 MB each</span></span>
        <input className="sr-only" type="file" name="clientLogos" accept="image/png,image/jpeg,image/webp" multiple onChange={event=>chooseLogos(event.target.files)}/>
      </label>
      {logoPreviews.length>0&&<div className="mt-3 flex flex-wrap gap-2">{logoPreviews.map((src,index)=><span key={src} className="grid size-16 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-white p-1.5"><Image unoptimized src={src} alt={`Client logo ${index+1} preview`} width={52} height={52} className="size-full object-contain"/></span>)}</div>}
      {tooManyLogos&&<p className="mt-2 text-xs font-semibold text-[#a5452f]" role="alert">Choose no more than three client logos.</p>}
    </div>

    {state?.message&&<div className={`mt-4 rounded-lg border p-3 text-xs leading-5 ${state.projectId?"border-[#b9d8ca] bg-[#f1f8f4] text-[#0c5b45]":"border-[#f0c8b7] bg-[#fff6f2] text-[#8b3d1f]"}`} role={state.projectId?"status":"alert"}><p>{state.message}</p>{state.projectId&&<Link className="mt-2 inline-flex font-bold underline" href={`/app/${organisationId}/projects/${state.projectId}/overview`}>Open project workspace</Link>}</div>}
    <button className="ev-button mt-5 w-full" disabled={pending||tooManyLogos}>{pending?"Creating project…":"Create project"}</button>
  </form>;
}
