"use client";

import Image from "next/image";
import {FolderKanban} from "lucide-react";
import {useState} from "react";
import {projectLogoEndpoint} from "@/lib/project-branding";

export function ProjectLogo({organisationId,projectId,name,size=48,className="",version,index=1}:{organisationId:string;projectId:string;name:string;size?:number;className?:string;version?:string|null;index?:number}){
 const src=projectLogoEndpoint(organisationId,projectId,version,index);
 const [failedSrc,setFailedSrc]=useState("");
 if(failedSrc===src)return <FolderKanban size={Math.max(16,Math.round(size*.45))} aria-label={`${name} has no client logo`}/>;
 return <Image unoptimized src={src} alt={`${name} client logo${index>1?` ${index}`:""}`} width={size} height={size} onError={()=>setFailedSrc(src)} className={className}/>;
}
