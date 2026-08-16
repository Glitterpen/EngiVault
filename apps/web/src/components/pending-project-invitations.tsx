"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {Check,Clock3,Copy,Mail,RefreshCw,Trash2} from "lucide-react";

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
  const visibleInvitations=invitations.filter(invitation=>!removedIds.includes(invitation.invitation_id));

  async function resend(invitationId:string){
    setBusyId(invitationId);setDeleteId(undefined);setCopiedId(undefined);setFeedback(current=>({...current,[invitationId]:{message:"",failed:false}}));
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations/${invitationId}/resend`,{method:"POST"});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be resent.");
      setFeedback(current=>({...current,[invitationId]:{message:body.message,failed:false,acceptUrl:body.delivery?.emailSent?undefined:body.delivery?.acceptUrl}}));
      router.refresh();
    }catch(error){
      setFeedback(current=>({...current,[invitationId]:{message:error instanceof Error?error.message:"Invitation could not be resent.",failed:true}}));
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
      setFeedback(current=>({...current,[invitationId]:{message:error instanceof Error?error.message:"Invitation could not be deleted.",failed:true}}));
    }finally{setBusyId(undefined)}
  }

  async function copy(invitationId:string,url:string){
    await navigator.clipboard.writeText(url);setCopiedId(invitationId);
  }

  return <section className="ev-card mt-6 overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:px-6">
      <div><div className="flex items-center gap-2"><Mail size={18} className="text-[#e8733f]"/><h2 className="font-semibold">Pending invitations</h2></div><p className="mt-1 text-xs leading-5 text-[#617083]">People listed here have been invited but have not joined the project yet.</p></div>
      <span className="rounded-full bg-[#fff0e9] px-3 py-1 text-xs font-bold text-[#a5452f]">{visibleInvitations.length} awaiting acceptance</span>
    </div>
    {visibleInvitations.length?<div>{visibleInvitations.map(invitation=>{
      const itemFeedback=feedback[invitation.invitation_id];const busy=busyId===invitation.invitation_id;const confirmingDelete=deleteId===invitation.invitation_id;
      return <article className="border-b border-[#edf1ef] p-5 last:border-0 sm:p-6" key={invitation.invitation_id}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f1ed] font-bold uppercase text-[#0c5b45]">{invitation.email.charAt(0)}</span><div className="min-w-0"><h3 className="truncate font-semibold">{invitation.email}</h3><p className="mt-1 text-xs capitalize text-[#617083]">{roleLabel(invitation.project_role)}{invitation.discipline?` · ${invitation.discipline}`:""}</p></div></div>
          <div className="flex flex-wrap items-center justify-end gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${invitation.expired?"bg-[#fde8e4] text-[#9b2c24]":"bg-[#fff7dd] text-[#7a5a00]"}`}>{invitation.expired?"Link expired":"Awaiting acceptance"}</span><button className="ev-button-secondary" type="button" disabled={busy} onClick={()=>void resend(invitation.invitation_id)}><RefreshCw size={15} className={busy&&!confirmingDelete?"animate-spin":""}/>{busy&&!confirmingDelete?"Resending…":"Resend invite"}</button><button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#efc7bb] px-3 text-xs font-bold text-[#9b2c24] transition hover:bg-[#fff0ec] disabled:opacity-50" type="button" disabled={busy} onClick={()=>setDeleteId(confirmingDelete?undefined:invitation.invitation_id)}><Trash2 size={15}/> Delete invitation</button></div>
        </div>
        <div className="mt-4 grid gap-2 rounded-xl bg-[#f7f9f8] p-3 text-xs text-[#617083] sm:grid-cols-3"><p><Clock3 size={13} className="mr-1 inline"/>Last sent: <strong className="text-[#24384f]">{formatDateTime(invitation.last_sent_at)}</strong></p><p>Expires: <strong className="text-[#24384f]">{formatDateTime(invitation.expires_at)}</strong></p><p>Delivery attempts: <strong className="text-[#24384f]">{invitation.send_count}</strong></p></div>
        {confirmingDelete&&<div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-3"><p className="text-xs leading-5 text-[#8b3d1f]"><strong>Delete this invitation?</strong> The current acceptance link will stop working immediately.</p><div className="flex gap-2"><button className="ev-button-secondary" type="button" disabled={busy} onClick={()=>setDeleteId(undefined)}>Keep invitation</button><button className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#9b2c24] px-3 text-xs font-bold text-white disabled:opacity-50" type="button" disabled={busy} onClick={()=>void remove(invitation.invitation_id)}><Trash2 size={15}/>{busy?"Deleting…":"Yes, delete"}</button></div></div>}
        {itemFeedback?.message&&<div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${itemFeedback.failed?"border-[#efc7bb] bg-[#fff7f4] text-[#8b3d1f]":"border-[#cfe1d8] bg-[#f3f8f5] text-[#0c5b45]"}`} role={itemFeedback.failed?"alert":"status"}><p>{itemFeedback.message}</p>{itemFeedback.acceptUrl&&<div className="mt-2 flex gap-2"><input className="ev-input min-w-0 flex-1 bg-white" value={itemFeedback.acceptUrl} readOnly aria-label={`Fresh invitation link for ${invitation.email}`}/><button className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9] bg-white" type="button" onClick={()=>void copy(invitation.invitation_id,itemFeedback.acceptUrl!)} aria-label={`Copy invitation link for ${invitation.email}`}>{copiedId===invitation.invitation_id?<Check size={16}/>:<Copy size={16}/>}</button></div>}</div>}
      </article>})}</div>:<div className="p-8 text-center"><p className="font-semibold text-[#24384f]">No pending invitations</p><p className="mt-1 text-sm text-[#617083]">Everyone invited to this project has accepted, or no invitations have been sent.</p></div>}
  </section>;
}

function roleLabel(role:string){return role.replaceAll("_"," ")}
function formatDateTime(value:string){return new Date(value).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
