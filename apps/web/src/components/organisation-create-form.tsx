"use client";

import { useActionState, useEffect, useState } from "react";
import { Building2, ImagePlus, Plus } from "lucide-react";
import Image from "next/image";
import { createOrganisation, type MutationState } from "@/app/app/actions";

export function OrganisationCreateForm({initialName="",initialSlug=""}:{initialName?:string;initialSlug?:string}={}){
  const [state,action,pending]=useActionState<MutationState,FormData>(createOrganisation,undefined);
  const [preview,setPreview]=useState("");
  const [fileName,setFileName]=useState("");

  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);

  function selectLogo(file:File|null){
    if(preview)URL.revokeObjectURL(preview);
    setPreview(file?URL.createObjectURL(file):"");
    setFileName(file?.name??"");
  }

  return <form action={action} className="ev-card h-fit p-6">
    <div className="flex items-center gap-2"><Plus size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Create organisation</h2></div>
    <label className="mt-6 block"><span className="ev-label">Organisation name</span><input className="ev-input" name="name" defaultValue={initialName} required/></label>
    <label className="mt-4 block"><span className="ev-label">URL slug</span><input className="ev-input" name="slug" defaultValue={initialSlug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="north-field-engineering" required/></label>
    <label className="mt-4 block">
      <span className="ev-label">Company logo</span>
      <span className="mt-1 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#b9c8c1] bg-[#f8faf9] p-3 transition hover:border-[#0c5b45]">
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white text-[#e8733f] shadow-sm">
          {preview?<Image unoptimized src={preview} alt="Selected company logo preview" width={56} height={56} className="size-full object-contain p-1"/>:<Building2 size={24}/>} 
        </span>
        <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"><ImagePlus size={16}/> {fileName?"Change logo":"Choose company logo"}</span><span className="mt-1 block truncate text-xs text-[#617083]">{fileName||"PNG, JPEG or WebP; maximum 2 MB"}</span></span>
        <input className="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp" required onChange={event=>selectLogo(event.target.files?.[0]??null)}/>
      </span>
    </label>
    {state?.message&&<p className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-xs leading-5 text-[#8b3d1f]" role="alert">{state.message}</p>}
    <button className="ev-button mt-5 w-full" disabled={pending}>{pending?"Creating workspace…":"Create secure workspace"}</button>
    <p className="mt-3 text-xs leading-5 text-[#617083]">Your logo is stored privately and shown only to authorised organisation members.</p>
  </form>;
}
