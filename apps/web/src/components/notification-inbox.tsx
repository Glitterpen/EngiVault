"use client";

import Link from "next/link";
import {useId,useState} from "react";
import {ChevronRight,Search} from "lucide-react";
import {PageState} from "@/components/page-state";
import type {NotificationDocumentContext} from "@/lib/notification-document-context";

export type NotificationInboxItem={
  id:string;
  kind:string;
  title:string;
  body:string;
  read_at:string|null;
  created_at:string;
  receivedLabel:string;
  document:NotificationDocumentContext|null;
};

export function NotificationInbox({items}:{items:NotificationInboxItem[]}){
  const id=useId();
  const [search,setSearch]=useState("");
  const [unreadOnly,setUnreadOnly]=useState(false);
  const query=search.trim().toLocaleLowerCase();
  const unreadCount=items.filter(item=>!item.read_at).length;
  const visible=items.filter(item=>(!unreadOnly||!item.read_at)&&`${item.title} ${item.body} ${item.document?.number??""} ${item.document?.title??""} ${item.document?.discipline??""}`.toLocaleLowerCase().includes(query));

  return <section className="ev-card min-w-0 overflow-hidden" aria-labelledby={`${id}-title`}>
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-title`} className="text-base font-semibold">Your inbox</h2><span className="text-xs text-[#526675]">{items.length} latest · {unreadCount} unread</span></header>
    {items.length>0&&<div data-preview-safe className="space-y-3 border-b border-[#e7ecef] px-4 py-3 sm:px-5">
      <label htmlFor={`${id}-search`} className="ev-label">Search notifications</label>
      <div className="relative min-w-0"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#526675]"/><input id={`${id}-search`} type="search" className="ev-input min-h-11 min-w-0 pl-10" placeholder="Message, document or discipline" value={search} onChange={event=>setSearch(event.target.value)}/></div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter notifications" className="inline-flex rounded-xl border border-[#dfe6eb] bg-[#f6f8f9] p-1">
          <button type="button" aria-pressed={!unreadOnly} onClick={()=>setUnreadOnly(false)} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${!unreadOnly?"bg-white text-[#10243e] shadow-sm":"text-[#526675] hover:bg-white/60"}`}>All <span className="ml-1 text-xs">{items.length}</span></button>
          <button type="button" aria-pressed={unreadOnly} onClick={()=>setUnreadOnly(true)} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${unreadOnly?"bg-white text-[#10243e] shadow-sm":"text-[#526675] hover:bg-white/60"}`}>Unread <span className="ml-1 text-xs">{unreadCount}</span></button>
        </div>
        <p role="status" className="text-xs text-[#526675]">{visible.length} of {items.length} loaded messages</p>
      </div>
    </div>}
    {visible.length>0?<ul aria-label="Notifications" className="divide-y divide-[#e7ecef]">{visible.map(item=><li key={item.id} className="min-w-0">
      <Link href={`/app/notifications/${item.id}`} className="group flex min-h-11 min-w-0 items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[#f4f7fb] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#10243e] motion-reduce:transition-none sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h3 className={`min-w-0 text-sm leading-6 [overflow-wrap:anywhere] ${item.read_at?"font-medium text-[#405566]":"font-semibold text-[#10243e]"}`}>{item.title}</h3>{!item.read_at&&<span className="shrink-0 rounded-md bg-[#eef3fa] px-2 py-0.5 text-xs font-medium text-[#10243e]">Unread</span>}</div>
          {item.document&&<div className="mt-1 min-w-0 text-xs leading-5 text-[#526675]"><p className="font-medium [overflow-wrap:anywhere]">{item.document.number}{item.document.discipline?` · ${item.document.discipline}`:""}</p><p className="[overflow-wrap:anywhere]">{item.document.title}</p></div>}
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-6 text-[#526675] [overflow-wrap:anywhere]">{item.body}</p>
          <time dateTime={item.created_at} className="mt-2 block text-xs text-[#657889]">{item.receivedLabel}</time>
        </div>
        <ChevronRight size={17} aria-hidden="true" className="mt-1 shrink-0 text-[#718294] group-hover:text-[#10243e]"/>
      </Link>
    </li>)}</ul>:<PageState kind="empty" headingLevel={3} title={items.length?unreadOnly&&!query?"No unread notifications in the latest messages.":"No notifications match your filters.":"You have no notifications."}
      actions={items.length>0?<button type="button" data-preview-safe className="ev-button-secondary min-h-11" onClick={()=>{setSearch("");setUnreadOnly(false);}}>Show all loaded messages</button>:undefined}/>}
  </section>;
}
