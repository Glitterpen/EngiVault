"use client";
import {HelpTip} from "@/components/help-tip";
import { customerErrorMessage } from "@/lib/customer-messages";


import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {Check,ChevronDown,Copy,Mail,RefreshCw,Trash2} from "lucide-react";

export type PendingProjectInvitation={
  invitation_id:string;
  email:string;
  project_role:string;
  discipline:string|null;
  created_at:string;
  last_sent_at:string;
  expires_at:string;
  send_count:number;
  expired:boolean;
};

type Feedback={message:string;failed:boolean;acceptUrl?:string};

export function PendingProjectInvitations({organisationId,projectId,invitations}:{organisationId:string;projectId:string;invitations:PendingProjectInvitation[]}){
  const router=useRouter();
  const [busyId,setBusyId]=useState<string>();
  const [deleteId,setDeleteId]=useState<string>();
  const [removedIds,setRemovedIds]=useState<string[]>([]);
  const [feedback,setFeedback]=useState<Record<string,Feedback>>({});
  const [copiedId,setCopiedId]=useState<string>();
  const disclosure=useRef<HTMLDetailsElement>(null);
  const visibleInvitations=invitations.filter(invitation=>!removedIds.includes(invitation.invitation_id));
  useEffect(()=>{
    if(disclosure.current&&(deleteId||Object.values(feedback).some(item=>item.message)))disclosure.current.open=true;
  },[deleteId,feedback]);

  async function resend(invitationId:string){
    setBusyId(invitationId);setDeleteId(undefined);setCopiedId(undefined);setFeedback(current=>({...current,[invitationId]:{message:"",failed:false}}));
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations/${invitationId}/resend`,{method:"POST"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be resent.");
      setFeedback(current=>({...current,[invitationId]:{message:body.message,failed:false,acceptUrl:body.delivery?.emailSent?undefined:body.delivery?.acceptUrl}}));
      router.refresh();
    }catch(error){
      setFeedback(current=>({...current,[invitationId]:{message:customerErrorMessage(error,"Invitation could not be resent."),failed:true}}));
    }finally{setBusyId(undefined)}
  }

  async function remove(invitationId:string){
    setBusyId(invitationId);setFeedback(current=>({...current,[invitationId]:{message:"",failed:false}}));
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations/${invitationId}`,{method:"DELETE"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be deleted.");
      setRemovedIds(current=>[...current,invitationId]);setDeleteId(undefined);router.refresh();
    }catch(error){
      setFeedback(current=>({...current,[invitationId]:{message:customerErrorMessage(error,"Invitation could not be deleted."),failed:true}}));
    }finally{setBusyId(undefined)}
  }

  async function copy(invitationId:string,url:string){
    await navigator.clipboard.writeText(url);setCopiedId(invitationId);
  }

  return <details ref={disclosure} className="ev-card group mt-5 overflow-hidden">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden sm:px-5">
      <Mail size={18} className="shrink-0 text-[#0c5b45]" aria-hidden="true"/>
      <h2 className="min-w-0 flex-1 font-semibold">Pending invitations</h2>
      <span className="rounded-full bg-[#f0f4f2] px-2.5 py-1 text-xs font-semibold text-[#526577]" aria-label={`${visibleInvitations.length} awaiting acceptance`}>{visibleInvitations.length}</span>
      <ChevronDown size={17} className="shrink-0 text-[#617083] transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true"/>
    </summary>
    <div className="flex items-center gap-2 border-t border-[#edf1ef] px-4 py-2 text-xs text-[#617083] sm:px-5">Awaiting project access<HelpTip label="Pending invitations">People listed here have been invited but have not joined the project yet.</HelpTip></div>
    {visibleInvitations.length?<div>{visibleInvitations.map(invitation=>{
      const itemFeedback=feedback[invitation.invitation_id];const busy=busyId===invitation.invitation_id;const confirmingDelete=deleteId===invitation.invitation_id;
      return <article className="min-w-0 border-b border-[#edf1ef] px-4 py-4 last:border-0 sm:px-5" key={invitation.invitation_id} aria-label={`Invitation for ${invitation.email}`} aria-busy={busy}>
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1"><h3 className="[overflow-wrap:anywhere] text-sm font-semibold text-[#24384f]">{invitation.email}</h3><p className="mt-1 [overflow-wrap:anywhere] text-xs capitalize leading-5 text-[#617083]">{roleLabel(invitation.project_role)}{invitation.discipline?` · ${invitation.discipline}`:""}</p><p className={`mt-1 text-xs font-medium ${invitation.expired?"text-[#9b2c24]":"text-[#617083]"}`}>{invitation.expired?"Link expired":"Awaiting acceptance"}</p></div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0"><button className="ev-button-secondary min-h-11" type="button" disabled={busy} aria-label={`Resend invitation to ${invitation.email}`} onClick={()=>void resend(invitation.invitation_id)}><RefreshCw size={15} aria-hidden="true" className={busy&&!confirmingDelete?"animate-spin motion-reduce:animate-none":""}/>{busy&&!confirmingDelete?"Resending…":"Resend invite"}</button><button className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#9b2c24] transition hover:bg-[#fff0ec] disabled:opacity-50" type="button" disabled={busy} aria-label={`Delete invitation for ${invitation.email}`} aria-expanded={confirmingDelete} aria-controls={`delete-invitation-${invitation.invitation_id}`} onClick={()=>setDeleteId(confirmingDelete?undefined:invitation.invitation_id)}><Trash2 size={15} aria-hidden="true"/> Delete</button></div>
        </div>
        <details className="mt-2 text-xs text-[#617083]"><summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">Delivery details</summary><dl className="grid gap-3 pb-1 sm:grid-cols-3"><div><dt>Last sent</dt><dd className="mt-1 font-medium text-[#24384f]">{formatDateTime(invitation.last_sent_at)}</dd></div><div><dt>Expires</dt><dd className="mt-1 font-medium text-[#24384f]">{formatDateTime(invitation.expires_at)}</dd></div><div><dt>Delivery attempts</dt><dd className="mt-1 font-medium text-[#24384f]">{invitation.send_count}</dd></div></dl></details>
        {confirmingDelete&&<div id={`delete-invitation-${invitation.invitation_id}`} role="group" aria-label={`Confirm deletion of invitation for ${invitation.email}`} className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3"><p className="text-xs leading-5 text-[#8b3d1f]"><strong>Delete this invitation?</strong> The current acceptance link will stop working immediately.</p><div className="flex flex-wrap gap-2"><button className="ev-button-secondary min-h-11" type="button" disabled={busy} onClick={()=>setDeleteId(undefined)}>Keep invitation</button><button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#9b2c24] px-3 text-xs font-bold text-white disabled:opacity-50" type="button" disabled={busy} aria-label={`Confirm delete invitation for ${invitation.email}`} onClick={()=>void remove(invitation.invitation_id)}><Trash2 size={15} aria-hidden="true"/>{busy?"Deleting…":"Yes, delete"}</button></div></div>}
        {itemFeedback?.message&&<div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${itemFeedback.failed?"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]":"border-[#cfe1d8] bg-[#f3f8f5] text-[#0c5b45]"}`} role={itemFeedback.failed?"alert":"status"}><p>{itemFeedback.message}</p>{itemFeedback.acceptUrl&&<div className="mt-2 flex gap-2"><input className="ev-input min-w-0 flex-1 bg-white" value={itemFeedback.acceptUrl} readOnly aria-label={`Fresh invitation link for ${invitation.email}`}/><button className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9] bg-white" type="button" onClick={()=>void copy(invitation.invitation_id,itemFeedback.acceptUrl!)} aria-label={`Copy invitation link for ${invitation.email}`}>{copiedId===invitation.invitation_id?<Check size={16}/>:<Copy size={16}/>}</button></div>}</div>}
      </article>})}</div>:<div className="px-4 py-5 sm:px-5"><p className="text-sm font-semibold text-[#24384f]">No pending invitations</p><p className="mt-1 text-sm text-[#617083]">Everyone invited to this project has accepted, or no invitations have been sent.</p></div>}
  </details>;
}

function roleLabel(role:string){return role.replaceAll("_"," ")}
function formatDateTime(value:string){return new Date(value).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
