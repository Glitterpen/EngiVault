"use client";

import {useActionState,useState} from "react";
import {deleteRemovedMemberAccount} from "@/app/app/account-deletion-actions";

export function RemovedAccountDelete({organisationId,userId,email}:{organisationId:string;userId:string;email:string}){
  const [open,setOpen]=useState(false);
  const [confirmation,setConfirmation]=useState("");
  const [acknowledged,setAcknowledged]=useState(false);
  const [state,action,pending]=useActionState(deleteRemovedMemberAccount,undefined);
  if(state?.ok)return <p role="status" className="rounded-lg bg-[#e8f1ed] p-3 text-sm text-[#0c5b45]">{state.message}</p>;
  return <div>
    <button type="button" className="ev-button-secondary text-[#a53724]" onClick={()=>setOpen(!open)} disabled={pending} aria-expanded={open}>Delete account</button>
    {open&&<form action={action} className="mt-3 rounded-xl border border-[#efc6b4] bg-[#fff9f5] p-4">
      <p className="font-semibold text-[#a53724]">Permanently delete this login?</p>
      <p className="mt-2 text-sm leading-6">Access and existing sign-in sessions will be revoked. Reinviting this email requires a new account. Submitted documents and audit history remain, with an anonymised identity reference.</p>
      <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="userId" value={userId}/>
      <label className="mt-3 block text-sm font-semibold">Type {email} to confirm<input className="ev-input mt-2 w-full" name="confirmationEmail" type="email" required autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)} disabled={pending}/></label>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" name="acknowledge" value="yes" required checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)} disabled={pending}/> I understand that the old account cannot be restored.</label>
      {state?.message&&<p role="alert" className="mt-3 text-sm text-[#a53724]">{state.message}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="rounded-lg bg-[#a53724] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={pending||!acknowledged||confirmation.trim().toLowerCase()!==email.toLowerCase()}>{pending?"Deleting…":"Confirm account deletion"}</button>
        <button type="button" className="ev-button-secondary" disabled={pending} onClick={()=>setOpen(false)}>Cancel</button>
      </div>
    </form>}
  </div>;
}
