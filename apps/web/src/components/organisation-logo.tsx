"use client";

import Image from "next/image";
import {ImagePlus,LoaderCircle} from "lucide-react";
import {useEffect,useState,type ReactNode} from "react";
import {OrganisationLogoRequired} from "@/components/organisation-logo-required";
import {organisationLogoEndpoint} from "@/lib/organisation-branding";

export function OrganisationLogo({organisationId,name,size=48,className="",version}:{organisationId:string;name:string;size?:number;className?:string;version?:string|null}){
 const src=organisationLogoEndpoint(organisationId,version);
 const [failedSrc,setFailedSrc]=useState("");
 if(failedSrc===src)return <span className={`grid place-items-center text-[#e8733f] ${className}`} style={{width:size,height:size}} title="Company logo has not been uploaded"><ImagePlus size={Math.max(18,Math.round(size*.36))}/></span>;
 return <Image unoptimized src={src} alt={`${name} logo`} width={size} height={size} onError={()=>setFailedSrc(src)} className={className}/>;
}

export function OrganisationBrandingGate({organisation,children}:{organisation:{id:string;name:string;slug:string};children:ReactNode}){
 const [status,setStatus]=useState<"checking"|"ready"|"missing">("checking");
 useEffect(()=>{
  const controller=new AbortController();let mounted=true;
  const timeout=window.setTimeout(()=>{controller.abort();if(mounted)setStatus("missing")},8_000);
  fetch(organisationLogoEndpoint(organisation.id),{cache:"no-store",credentials:"same-origin",signal:controller.signal})
   .then(response=>{if(mounted)setStatus(response.ok?"ready":"missing")})
   .catch(()=>{if(mounted)setStatus("missing")})
   .finally(()=>window.clearTimeout(timeout));
  return()=>{mounted=false;window.clearTimeout(timeout);controller.abort()};
 },[organisation.id]);
 if(status==="checking")return <div className="grid min-h-[45vh] place-items-center text-[#0c5b45]"><span className="flex items-center gap-2 text-sm font-semibold"><LoaderCircle className="animate-spin" size={18}/> Loading company identity…</span></div>;
 if(status==="missing")return <OrganisationLogoRequired organisation={organisation}/>;
 return children;
}
