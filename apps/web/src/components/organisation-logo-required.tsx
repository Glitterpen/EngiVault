"use client";

import Image from "next/image";
import {useActionState,useEffect,useState} from "react";
import {Building2,ImagePlus,ShieldCheck} from "lucide-react";
import {updateOrganisation,type MutationState} from "@/app/app/actions";

export function OrganisationLogoRequired({organisation}:{organisation:{id:string;name:string;slug:string}}){
 const [state,action,pending]=useActionState<MutationState,FormData>(updateOrganisation,undefined);
 const [preview,setPreview]=useState("");
 const [fileName,setFileName]=useState("");
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 function selectLogo(file:File|null){if(preview)URL.revokeObjectURL(preview);setPreview(file?URL.createObjectURL(file):"");setFileName(file?.name??"")}
 return <div className="mx-auto max-w-xl py-8 sm:py-16">
  <form action={action} className="ev-card p-6 sm:p-8">
   <input type="hidden" name="organisationId" value={organisation.id}/>
   <input type="hidden" name="name" value={organisation.name}/>
   <input type="hidden" name="slug" value={organisation.slug}/>
   <div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><Building2 size={22}/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Required company identity</p><h1 className="mt-2 text-2xl font-semibold">Add the {organisation.name} logo</h1><p className="mt-2 text-sm leading-6 text-[#617083]">EngiCite uses this single company logo automatically as the organisation icon. There is no separate icon selection.</p></div></div>
   <label className="mt-6 block">
    <span className="ev-label">Company logo</span>
    <span className="mt-2 flex cursor-pointer items-center gap-4 rounded-2xl border border-dashed border-[#b9c8c1] bg-[#f8faf9] p-4 transition hover:border-[#0c5b45]">
     <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white text-[#e8733f] shadow-sm">{preview?<Image unoptimized src={preview} alt="Company logo preview" width={80} height={80} className="size-full object-contain p-2"/>:<ImagePlus size={26}/>}</span>
     <span className="min-w-0 flex-1"><span className="font-semibold text-[#0c5b45]">{fileName?"Change uploaded logo":"Choose company logo"}</span><span className="mt-1 block truncate text-xs text-[#617083]">{fileName||"PNG, JPEG or WebP · maximum 2 MB"}</span></span>
     <input className="sr-only" type="file" name="logo" accept="image/png,image/jpeg,image/webp" required onChange={event=>selectLogo(event.target.files?.[0]??null)}/>
    </span>
   </label>
   {state?.message&&<p className="mt-4 rounded-lg border border-[#f0c8b7] bg-[#fff6f2] p-3 text-sm text-[#8b3d1f]" role="alert">{state.message}</p>}
   <button className="ev-button mt-5 w-full" disabled={pending||!fileName}><ShieldCheck size={17}/>{pending?"Applying company identity…":"Use logo as organisation icon"}</button>
   <p className="mt-3 text-center text-xs leading-5 text-[#617083]">The logo remains private and is shown only inside authorised EngiCite workspaces.</p>
  </form>
 </div>
}
