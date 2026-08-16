"use client";

import {Eye,LockKeyhole} from "lucide-react";
import {usePathname} from "next/navigation";
import {roleLabel} from "@/lib/role-experience";

type Preview={organisationId:string;projectId:string;role:"project_admin"|"document_controller"|"engineer"};

export function AdminPreviewBoundary({preview,children}:{preview:Preview|null;children:React.ReactNode}){
  const pathname=usePathname();
  const active=Boolean(preview&&pathname.includes(`/app/${preview.organisationId}/projects/${preview.projectId}`));
  if(!active||!preview)return children;
  return <>
    <section className="border-b border-[#f1c5ad] bg-[#fff5ee] px-5 py-3 lg:px-8" role="status">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-[#e8733f] text-white"><Eye size={17}/></span><div><p className="text-sm font-bold text-[#7b321e]">Read-only administrator preview: {roleLabel(preview.role)}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-[#8a5a4b]"><LockKeyhole size={12}/> Project controls are locked. Every preview session is recorded in the audit log.</p></div></div>
        <form action="/api/admin-preview/exit" method="post"><button className="ev-button-secondary" type="submit">Exit role preview</button></form>
      </div>
    </section>
    <div className="pointer-events-none select-none opacity-[.92]" aria-label="Read-only role preview">{children}</div>
  </>;
}
