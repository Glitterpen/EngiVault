"use client";
import {useActionState,useState} from "react";
import {saveNotificationPreferences} from "@/app/app/notification-preference-actions";
import {EMAIL_EVENTS,type NotificationPreferences} from "@/lib/notification-preferences";
import {HelpTip} from "@/components/help-tip";
import {CheckCheck} from "lucide-react";

export function NotificationPreferencesForm({organisationId,projectId,preferences:p}:{organisationId:string;projectId:string|null;preferences:NotificationPreferences}) {
 const [state,action,pending]=useActionState(saveNotificationPreferences,{});
 const [allDisciplines,setAllDisciplines]=useState(p.disciplines===null);
 const [allEvents,setAllEvents]=useState(p.events===null);
 return <form action={action} className="ev-card mt-5 min-w-0 overflow-hidden">
  <input type="hidden" name="organisationId" value={organisationId}/><input type="hidden" name="projectId" value={projectId??""}/>
  <div className="flex items-start gap-2.5 border-b border-[#e5ebe8] px-4 py-4 text-sm text-[#526675] sm:px-5"><CheckCheck aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-[#0c5b45]"/><p>In-app notifications: All enabled</p></div>
  <fieldset disabled={pending} className="min-w-0 divide-y divide-[#e5ebe8]">
   <div className="px-4 py-3 sm:px-5"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-[#10243e]"><input className="size-4 shrink-0 accent-[#0c5b45]" type="checkbox" name="emailEnabled" defaultChecked={p.emailEnabled}/> Receive event emails</label></div>
   <fieldset className="min-w-0 px-4 py-4 sm:px-5"><legend className="float-left mb-2 flex w-full items-center gap-1.5 text-sm font-semibold text-[#10243e]">Disciplines <HelpTip label="Email discipline filter">Only matching disciplines will reach your inbox. General notices covers events without a discipline. All includes disciplines added later.</HelpTip></legend>
    <label className="clear-both flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input className="size-4 shrink-0 accent-[#0c5b45]" type="checkbox" name="allDisciplines" checked={allDisciplines} onChange={e=>setAllDisciplines(e.target.checked)}/> All disciplines and general notices</label>
    <div hidden={allDisciplines}><div className="mt-2 grid gap-x-5 sm:grid-cols-2">{["__general__",...p.choices].map(d=><label key={d} className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 py-3 text-sm leading-5"><input className="mt-0.5 size-4 shrink-0 accent-[#0c5b45]" type="checkbox" name="disciplines" value={d} disabled={allDisciplines} defaultChecked={p.disciplines?.includes(d)??false}/><span className="min-w-0 break-words">{d==="__general__"?"General project / organisation notices":d}</span></label>)}</div></div>
   </fieldset>
   <fieldset className="min-w-0 px-4 py-4 sm:px-5"><legend className="float-left mb-2 flex w-full items-center gap-1.5 text-sm font-semibold text-[#10243e]">Events <HelpTip label="Email event filter">When both filters are restricted, an email must match both an event and a discipline. Selecting none sends no event emails. Authentication and password-recovery emails are unaffected. Already sending emails may still arrive.</HelpTip></legend>
    <label className="clear-both flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input className="size-4 shrink-0 accent-[#0c5b45]" type="checkbox" name="allEvents" checked={allEvents} onChange={e=>setAllEvents(e.target.checked)}/> All events</label>
    <div hidden={allEvents}><div className="mt-2 grid gap-x-5 sm:grid-cols-2">{Object.entries(EMAIL_EVENTS).map(([id,label])=><label key={id} className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 py-3 text-sm leading-5"><input className="mt-0.5 size-4 shrink-0 accent-[#0c5b45]" type="checkbox" name="events" value={id} disabled={allEvents} defaultChecked={p.events?.includes(id)??false}/><span className="min-w-0 break-words">{label}</span></label>)}</div></div>
   </fieldset>
   <div className="px-4 py-4 sm:px-5"><button className="ev-button w-full sm:w-auto" disabled={pending}>{pending?"Saving…":"Save my email preferences"}</button></div>
  </fieldset>
  {state.message&&<p role={state.ok?"status":"alert"} className={`border-t border-[#e5ebe8] px-4 py-4 text-sm leading-6 sm:px-5 ${state.ok?"text-[#0c5b45]":"text-[#a5452f]"}`}>{state.message}</p>}
 </form>;
}
