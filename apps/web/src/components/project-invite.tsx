"use client";
import { useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";

export function ProjectInvite({organisationId,projectId}:{organisationId:string;projectId:string}){
  const [message,setMessage]=useState("");
  const [url,setUrl]=useState("");
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  const [emailValid,setEmailValid]=useState(false);
  const [failed,setFailed]=useState(false);

  async function submit(formData:FormData){
    setBusy(true);setFailed(false);setMessage("");setUrl("");setCopied(false);
    try{
      const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/invitations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:formData.get("email"),role:formData.get("role")})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error?.message??"Invitation could not be created.");
      setUrl(body.delivery.acceptUrl);setMessage("Secure invitation created. Copy the one-time acceptance link below.");
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Invitation failed.");}
    finally{setBusy(false)}
  }

  async function copy(){await navigator.clipboard.writeText(url);setCopied(true)}

  return <form onSubmit={event=>{event.preventDefault();void submit(new FormData(event.currentTarget))}} className="ev-card p-6">
    <div className="flex items-center gap-2"><UserPlus size={18} className="text-[#e8733f]"/><h2 className="font-bold">Invite project member</h2></div>
    <label className="mt-5 block"><span className="ev-label">Work email</span><input className="ev-input" name="email" type="email" required onChange={event=>{setEmailValid(event.currentTarget.validity.valid&&event.currentTarget.value.length>0);setFailed(false);setMessage("")}}/></label>
    <label className="mt-4 block"><span className="ev-label">Project role</span><select className="ev-input" name="role" defaultValue="engineer"><option value="project_admin">Project administrator</option><option value="document_controller">Document controller</option><option value="engineer">Engineer</option><option value="viewer">Viewer</option></select></label>
    <button type="submit" className="ev-button mt-5 w-full" disabled={busy||!emailValid}>{busy?"Creating invitation…":"Create secure invitation"}</button>
    {!emailValid&&!message&&<p className="mt-3 text-xs text-[#617083]">Enter a valid email address to activate the invitation button.</p>}
    {message&&<p className={`mt-4 text-xs leading-5 ${failed?"text-[#8b3d1f]":"text-[#0c5b45]"}`} role={failed?"alert":"status"}>{message}</p>}
    {url&&<div className="mt-3 flex gap-2"><input className="ev-input min-w-0 flex-1" value={url} readOnly aria-label="Invitation acceptance URL"/><button type="button" onClick={copy} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dce2e9]" title="Copy invitation link">{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>}
  </form>
}
