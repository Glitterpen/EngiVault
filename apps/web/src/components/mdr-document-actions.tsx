"use client";

import Link from "next/link";
import {useActionState} from "react";
import {ArchiveRestore,Pencil,Trash2} from "lucide-react";
import {setDocumentArchived,type MutationState} from "@/app/app/actions";

export function MdrDocumentActions({
  organisationId,
  projectId,
  documentId,
  documentNumber,
  archived,
}:{
  organisationId:string;
  projectId:string;
  documentId:string;
  documentNumber:string;
  archived:boolean;
}){
  const [state,action,pending]=useActionState<MutationState,FormData>(setDocumentArchived,undefined);
  const detailPath=`/app/${organisationId}/projects/${projectId}/documents/${documentId}#document-management`;
  const prompt=archived
    ?`Restore ${documentNumber} to the active Master Document Register?`
    :`Remove ${documentNumber} from the active Master Document Register? Its revisions and audit history will be preserved and the DCC can restore it later.`;

  return <div className="flex flex-col items-end gap-1.5">
    <div className="flex flex-col items-stretch justify-end gap-1.5 sm:flex-row sm:items-center">
      <Link href={detailPath} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#d8e0dc] px-2 text-[10px] font-bold text-[#0c5b45] transition hover:bg-[#eef4f1] sm:text-xs" aria-label={`Edit ${documentNumber}`} title="Edit MDR deliverable"><Pencil size={13}/> Edit</Link>
      <form action={action} onSubmit={event=>{if(!window.confirm(prompt))event.preventDefault()}}>
        <input type="hidden" name="organisationId" value={organisationId}/>
        <input type="hidden" name="projectId" value={projectId}/>
        <input type="hidden" name="documentId" value={documentId}/>
        <input type="hidden" name="archived" value={String(!archived)}/>
        <button disabled={pending} className={`inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-[10px] font-bold transition disabled:cursor-wait disabled:opacity-50 sm:text-xs ${archived?"border-[#bdd7cc] text-[#0c5b45] hover:bg-[#eef4f1]":"border-[#efc6b4] text-[#a5452f] hover:bg-[#fff4ef]"}`} aria-label={`${archived?"Restore":"Delete"} ${documentNumber}`} title={archived?"Restore to active MDR":"Delete from active MDR"}>{archived?<ArchiveRestore size={13}/>:<Trash2 size={13}/>} {pending?"Saving…":archived?"Restore":"Delete"}</button>
      </form>
    </div>
    {state?.message&&!state.mutationId&&<p className="max-w-44 text-right text-[10px] leading-4 text-[#a5452f]" role="alert">{state.message}</p>}
  </div>;
}
