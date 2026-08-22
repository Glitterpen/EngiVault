"use client";

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
  const [discipline,setDiscipline]=useState(lockedDiscipline??"");
  const canSubmit=emailValid&&(role!=="engineer"||Boolean(lockedDiscipline||discipline));

  async function submit(formData:FormData){
    setBusy(true);setFailed(false);setMessage("");setUrl("");setCopied(false);
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations`,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({email:formData.get("email"),role:formData.get("role"),discipline:formData.get("discipline")||undefined}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be created.");
      setUrl(body.delivery.acceptUrl);
      setMessage(body.delivery.emailSent?"Invitation emailed successfully. The acceptance link is also available below.":body.delivery.reason==="identity_unavailable"?"Invitation created, but the organisation identity could not be verified, so no email was sent. Copy the one-time link below.":"Secure invitation created. Email delivery is not configured, so copy and send the one-time link below.");
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
      ?<div className="mt-4"><span className="ev-label">Authorised discipline</span><input type="hidden" name="discipline" value={lockedDiscipline}/><div className="rounded-xl border border-[#cfe0d8] bg-[#f1f7f4] px-4 py-3 font-semibold text-[#0c5b45]">{lockedDiscipline}</div><span className="mt-1 block text-xs leading-5 text-[#617083]">This invitation grants upload access only to MDR documents in this discipline.</span></div>
      :<label className="mt-4 block"><span className="ev-label">Authorised discipline</span><select className="ev-input" name="discipline" required value={discipline} onChange={event=>setDiscipline(event.target.value)}><option value="" disabled>Select engineering discipline</option>{disciplines.map(item=><option key={item.code} value={item.name}>{item.code} — {item.name}</option>)}</select><span className="mt-1 block text-xs leading-5 text-[#617083]">The engineer may upload only to MDR documents in this discipline.</span>{!disciplines.length&&<span className="mt-2 block text-xs font-semibold text-[#a5452f]">No active disciplines are configured. Add an MDR discipline category before inviting an engineer.</span>}</label>)}
    <button type="submit" className="ev-button mt-5 w-full" disabled={busy||!canSubmit}>{busy?"Creating invitation…":"Create secure invitation"}</button>
    {!emailValid&&!message&&<p className="mt-3 text-xs text-[#617083]">Enter a valid email address to activate the invitation button.</p>}
    {emailValid&&role==="engineer"&&!lockedDiscipline&&!discipline&&!message&&<p className="mt-3 text-xs text-[#617083]">Select the engineer&apos;s authorised discipline.</p>}
    {message&&<p className={`mt-4 text-xs leading-5 ${failed?"text-[#8b3d1f]":"text-[#0c5b45]"}`} role={failed?"alert":"status"}>{message}</p>}
    {url&&<div className="mt-3 flex gap-2"><input className="ev-input min-w-0 flex-1" value={url} readOnly aria-label="Invitation acceptance URL"/><button type="button" onClick={copy} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9]" title="Copy invitation link">{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>}
  </form>;
}
