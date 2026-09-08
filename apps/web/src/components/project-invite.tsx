"use client";
import {disciplineLabel} from "@/lib/project-disciplines";

import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";

type Discipline={code:string;name:string};
export type InvitableRole="project_admin"|"document_controller"|"engineer";
const roleLabels:Record<InvitableRole,string>={project_admin:"Project Manager",document_controller:"Document Controller",engineer:"Discipline Engineer"};

type ProjectInviteProps={
  organisationId:string;
  projectId:string;
  disciplines:Discipline[];
  bare?:boolean;
  allowedRoles?:InvitableRole[];
  lockedDiscipline?:string;
};

export function ProjectInvite({organisationId,projectId,disciplines,bare=false,allowedRoles=["project_admin","document_controller","engineer"],lockedDiscipline}:ProjectInviteProps){
  const [message,setMessage]=useState("");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  const [emailValid,setEmailValid]=useState(false);
  const [failed,setFailed]=useState(false);
  const [role,setRole]=useState<InvitableRole>(allowedRoles[0]??"engineer");
  const [selectedDisciplines,setSelectedDisciplines]=useState<string[]>(lockedDiscipline?[lockedDiscipline]:[]);
  const canSubmit=emailValid&&(role!=="engineer"||selectedDisciplines.length>0);

  async function submit(formData:FormData){
    setBusy(true);setFailed(false);setMessage("");setUrl("");setCopied(false);
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations`,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({email:formData.get("email"),role:formData.get("role"),disciplines:role==="engineer"?selectedDisciplines:[]}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be created.");
      setUrl(body.delivery.acceptUrl);
      setMessage(body.delivery.emailSent?"Invitation emailed successfully. The acceptance link is also available below.":body.delivery.reason==="identity_unavailable"?"Invitation created, but the organisation identity could not be verified, so no email was sent. Copy the one-time link below.":body.delivery.reason==="provider_error"?"Invitation created, but email delivery failed. Copy and send the one-time link below, or use Resend invite.":"Secure invitation created. Email delivery is not configured, so copy and send the one-time link below.");
    }catch(error){
      setFailed(true);setMessage(error instanceof Error?error.message:"Invitation failed.");
    }finally{setBusy(false)}
  }

  async function copy(){await navigator.clipboard.writeText(url);setCopied(true)}

  return <form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget))}} className={bare?"":"ev-card p-6"}>
    <div className="flex items-center gap-2"><UserPlus size={18} className="text-[#e8733f]"/><h2 className="font-bold">Invite project member</h2></div>
    <label className="mt-5 block"><span className="ev-label">Work email</span><input className="ev-input" name="email" type="email" required onChange={event=>{setEmailValid(event.currentTarget.validity.valid&&event.currentTarget.value.length>0);setFailed(false);setMessage("")}}/></label>
    <label className="mt-4 block"><span className="ev-label">Project role</span><select className="ev-input" name="role" value={role} onChange={event=>setRole(event.target.value as InvitableRole)}>{allowedRoles.map(value=><option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
    {role==="engineer"&&(lockedDiscipline
      ?<div className="mt-4"><span className="ev-label">Authorised discipline</span><div className="rounded-xl border border-[#cfe0d8] bg-[#f1f7f4] px-4 py-3 font-semibold text-[#0c5b45]">{lockedDiscipline}</div><span className="mt-1 block text-xs leading-5 text-[#617083]">This invitation authorises this discipline. DCC assigns its MDR deliverables separately.</span></div>
      :<fieldset className="mt-4" disabled={busy}><legend className="ev-label">Authorised disciplines</legend><p className="mt-1 text-xs leading-5 text-[#617083]">Select one or more disciplines for this work email. The engineer uses one account and one dashboard for all selected disciplines.</p><div className="mt-3 grid max-h-60 gap-2 overflow-y-auto rounded-xl border border-[#dce2e9] p-3">{disciplines.map(item=><label key={item.name} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[#f1f7f4]"><input type="checkbox" name="disciplines" value={item.name} checked={selectedDisciplines.includes(item.name)} onChange={event=>{setSelectedDisciplines(current=>event.target.checked?[...current,item.name]:current.filter(name=>name!==item.name));setMessage("")}} className="size-4 shrink-0 accent-[#0c5b45]"/><span className="min-w-0 break-words text-sm">{disciplineLabel(item)}</span></label>)}</div><p className="mt-2 text-xs font-semibold text-[#0c5b45]">{selectedDisciplines.length} selected</p><p className="mt-1 text-xs leading-5 text-[#617083]">DCC assigns MDR deliverables separately. Uploads remain limited to assigned documents in these disciplines.</p>{!disciplines.length&&<p className="mt-2 text-xs font-semibold text-[#a5452f]">No disciplines are available. Use Project disciplines → Add discipline in Project team & resources first.</p>}</fieldset>)}
    <button type="submit" className="ev-button mt-5 w-full" disabled={busy||!canSubmit}>{busy?"Creating invitation…":"Create secure invitation"}</button>
    {!emailValid&&!message&&<p className="mt-3 text-xs text-[#617083]">Enter a valid email address to activate the invitation button.</p>}
    {emailValid&&role==="engineer"&&!selectedDisciplines.length&&!message&&<p className="mt-3 text-xs text-[#617083]">Select at least one authorised discipline.</p>}
    {message&&<p className={`mt-4 text-xs leading-5 ${failed?"text-[#8b3d1f]":"text-[#0c5b45]"}`} role={failed?"alert":"status"}>{message}</p>}
    {url&&<div className="mt-3 flex gap-2"><input className="ev-input min-w-0 flex-1" value={url} readOnly aria-label="Invitation acceptance URL"/><button type="button" onClick={copy} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9]" title="Copy invitation link">{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>}
  </form>;
}
