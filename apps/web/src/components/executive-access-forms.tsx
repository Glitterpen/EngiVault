"use client";
import {useActionState,useState} from "react";
import {inviteExecutive,revokeExecutive} from "@/app/app/executive-actions";
import {HelpTip} from "./help-tip";

export function ExecutiveInviteForm({organisationId}:{organisationId:string}){
  const [state,action,pending]=useActionState(inviteExecutive,undefined);
  return <form action={action} className="ev-card mt-6 space-y-4 p-5">
    <h2 className="font-semibold">Invite Executive Viewer <HelpTip label="Private executive invitations">Only Organisation Administrators may invite or revoke this role. Executive Viewers see live organisation and project summaries, not documents, team lists or editing tools. Their identities stay out of project teams and are visible only to authorised administrators and security auditing. Re-inviting a pending email replaces its earlier link.</HelpTip></h2>
    <input type="hidden" name="organisationId" value={organisationId}/>
    <label className="block"><span className="ev-label">Work email</span><input className="ev-input" name="email" type="email" required maxLength={254} autoComplete="off"/></label>
    <button className="ev-button" disabled={pending}>{pending?"Sending…":"Send private invitation"}</button>
    {state&&<p role={state.ok?"status":"alert"} className="text-sm">{state.message}</p>}
    {state?.acceptUrl&&<label className="block"><span className="ev-label">One-time invitation link</span><input className="ev-input" readOnly value={state.acceptUrl} onFocus={event=>event.currentTarget.select()}/></label>}
  </form>;
}
export function ExecutiveRevokeForm({organisationId,id,kind,email}:{organisationId:string;id:string;kind:"member"|"invitation";email:string}){
  const [open,setOpen]=useState(false);
  const [state,action,pending]=useActionState(revokeExecutive,undefined);
  if(state?.ok)return <p role="status" className="mt-3 text-sm">{state.message}</p>;
  if(!open)return <button className="ev-button-secondary" type="button" onClick={()=>setOpen(true)}>Revoke {kind==="invitation"?"invitation":"access"}</button>;
  return <form action={action} className="mt-3 space-y-3 rounded-xl border border-[#efc6b4] p-4">
    <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/>
    <p className="break-words text-sm">Revoke executive {kind==="invitation"?"invitation":"access"} for {email}? Project data will not be changed.</p>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" required name="confirmed" value="true" className="mt-1"/>I confirm this access should be revoked.</label>
    {state?.message&&<p role="alert" className="text-sm">{state.message}</p>}
    <div className="flex flex-wrap gap-2"><button className="ev-button" disabled={pending}>{pending?"Revoking…":"Confirm revocation"}</button><button className="ev-button-secondary" type="button" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button></div>
  </form>;
}
