"use client";
import {useActionState,useState} from "react";
import {saveNotificationPreferences} from "@/app/app/notification-preference-actions";
import {EMAIL_EVENTS,type NotificationPreferences} from "@/lib/notification-preferences";
import {HelpTip} from "@/components/help-tip";

export function NotificationPreferencesForm({organisationId,projectId,preferences:p}:{organisationId:string;projectId:string|null;preferences:NotificationPreferences}) {
 const [state,action,pending]=useActionState(saveNotificationPreferences,{});
 const [allDisciplines,setAllDisciplines]=useState(p.disciplines===null);
 const [allEvents,setAllEvents]=useState(p.events===null);
 return <form action={action} className="ev-card mt-6 space-y-6 p-5 sm:p-6">
  <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId??""}/>
  <p className="rounded-lg bg-[#e8f1ed] p-3 text-sm text-[#0c5b45]">In-app notifications: All enabled</p>
  <fieldset disabled={pending} className="space-y-6">
   <label className="flex items-center gap-3"><input type="checkbox" name="emailEnabled" defaultChecked={p.emailEnabled}/> Receive event emails</label>
   <fieldset><legend className="mb-3 font-semibold">Disciplines <HelpTip label="Email discipline filter">Only matching disciplines will reach your inbox. General notices covers events without a discipline. All includes disciplines added later.</HelpTip></legend>
    <label className="flex items-center gap-2"><input type="checkbox" name="allDisciplines" checked={allDisciplines} onChange={e=>setAllDisciplines(e.target.checked)}/> All disciplines and general notices</label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{["__general__",...p.choices].map(d=><label key={d} className="flex items-start gap-2 break-words text-sm"><input type="checkbox" name="disciplines" value={d} disabled={allDisciplines} defaultChecked={p.disciplines?.includes(d)??false}/>{d==="__general__"?"General project / organisation notices":d}</label>)}</div>
   </fieldset>
   <fieldset><legend className="mb-3 font-semibold">Events <HelpTip label="Email event filter">When both filters are restricted, an email must match both an event and a discipline. Selecting none sends no event emails. Authentication and password-recovery emails are unaffected. Already sending emails may still arrive.</HelpTip></legend>
    <label className="flex items-center gap-2"><input type="checkbox" name="allEvents" checked={allEvents} onChange={e=>setAllEvents(e.target.checked)}/> All events</label>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(EMAIL_EVENTS).map(([id,label])=><label key={id} className="flex items-start gap-2 text-sm"><input type="checkbox" name="events" value={id} disabled={allEvents} defaultChecked={p.events?.includes(id)??false}/>{label}</label>)}</div>
   </fieldset>
   <button className="ev-button" disabled={pending}>{pending?"Saving…":"Save my email preferences"}</button>
  </fieldset>
  {state.message&&<p role={state.ok?"status":"alert"} className="text-sm">{state.message}</p>}
 </form>;
}
