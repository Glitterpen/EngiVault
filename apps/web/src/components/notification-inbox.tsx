"use client";

import Link from "next/link";
import {useId,useRef,useState} from "react";
import {ChevronRight,Search} from "lucide-react";
import {PageState} from "@/components/page-state";
import type {NotificationDocumentContext} from "@/lib/notification-document-context";
import {BrowseNavigation} from "@/components/browse-navigation";
import {HelpTip} from "@/components/help-tip";

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

const MESSAGES_PER_PAGE=10;
const receivedDate=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});

function groupByReceivedDate(items:NotificationInboxItem[]){
  const groups:{key:string;label:string;items:NotificationInboxItem[]}[]=[];
  for(const item of items){
    const date=new Date(item.created_at);
    const valid=!Number.isNaN(date.getTime());
    const key=valid?date.toISOString().slice(0,10):"unknown";
    const previous=groups.at(-1);
    // Group consecutive dates without changing the supplied newest-first order.
    if(previous?.key===key)previous.items.push(item);
    else groups.push({key,label:valid?`${receivedDate.format(date)} (UTC)`:"Date unavailable",items:[item]});
  }
  return groups;
}

type InboxPaging={q:string;unreadOnly:boolean;page:number;pages:number;total:number;allCount:number;unreadCount:number};
export function NotificationInbox({items,paging}:{items:NotificationInboxItem[];paging?:InboxPaging}){
  return paging?<PagedNotificationInbox items={items} paging={paging}/>:<LocalNotificationInbox items={items}/>;
}
function PagedNotificationInbox({items,paging}:{items:NotificationInboxItem[];paging:InboxPaging}){
  const id=useId(),groups=groupByReceivedDate(items);
  return <section className="ev-card min-w-0 overflow-hidden" aria-labelledby={`${id}-heading`}>
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-heading`} className="text-base font-semibold">Your inbox</h2><p className="text-xs text-[#526675]">{paging.allCount} messages · {paging.unreadCount} unread</p></header>
    <form data-preview-safe method="get" action="/app/notifications" aria-label="Search notification history" className="flex min-w-0 flex-wrap items-end gap-3 border-b border-[#e7ecef] p-4 sm:px-5">
      <div className="min-w-0 flex-1 basis-52"><div className="flex items-center gap-1"><label htmlFor={`${id}-search`} className="ev-label">Search message text</label><HelpTip label="Notification search coverage">Search checks titles, message text and event names across your inbox, including older messages. Related document details are shown where available.</HelpTip></div><input id={`${id}-search`} name="q" type="search" maxLength={100} defaultValue={paging.q} className="ev-input" placeholder="Title, message or event"/></div>
      <label className="min-w-0 basis-36"><span className="ev-label">Messages</span><select name="unread" defaultValue={paging.unreadOnly?"1":""} className="ev-input"><option value="">All messages</option><option value="1">Unread only</option></select></label>
      <button className="ev-button-secondary">Search</button>{(paging.q||paging.unreadOnly)&&<Link href="/app/notifications" className="ev-button-secondary">Clear search</Link>}
    </form>
    <div className="px-4 sm:px-5"><BrowseNavigation path="/app/notifications" query={{q:paging.q,unread:paging.unreadOnly?"1":""}} {...paging} count={items.length} label="Notifications"/></div>
    {items.length?<ul aria-label="Notifications">{groups.map(group=><li key={group.key}><h3 className="border-y border-[#e7ecef] bg-[#f6f8f9] px-4 py-2 text-xs font-semibold text-[#526675] sm:px-5">{group.label}</h3><ul aria-label={`Notifications received ${group.label}`} className="divide-y divide-[#e7ecef]">{group.items.map(item=><li key={item.id}><Link href={`/app/notifications/${item.id}`} className="flex min-h-11 min-w-0 items-start gap-3 px-4 py-4 hover:bg-[#f4f7fb] focus-visible:outline-offset-[-3px] sm:px-5"><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><h4 className={`min-w-0 text-sm leading-6 [overflow-wrap:anywhere] ${item.read_at?"font-medium text-[#405566]":"font-semibold text-[#10243e]"}`}>{item.title}</h4>{!item.read_at&&<span className="rounded-md bg-[#eef3fa] px-2 py-0.5 text-xs font-medium text-[#10243e]">Unread</span>}</div>{item.document&&<div className="mt-1 text-xs leading-5 text-[#526675] [overflow-wrap:anywhere]"><p className="font-medium">{item.document.number} · {item.document.discipline}</p><p>{item.document.title}</p></div>}<p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-6 text-[#526675] [overflow-wrap:anywhere]">{item.body}</p><time dateTime={item.created_at} className="mt-2 block text-xs text-[#657889]">{item.receivedLabel}</time></div><ChevronRight size={17} aria-hidden="true" className="mt-1 shrink-0 text-[#718294]"/></Link></li>)}</ul></li>)}</ul>:<PageState kind="empty" headingLevel={3} title={paging.allCount?"No notifications match this search and message filter.":"You have no notifications."}/>}
  </section>;
}
function LocalNotificationInbox({items}:{items:NotificationInboxItem[]}){
  const id=useId();
  const results=useRef<HTMLDivElement>(null);
  const [search,setSearch]=useState("");
  const [unreadOnly,setUnreadOnly]=useState(false);
  const [page,setPage]=useState(1);
  const query=search.trim().toLocaleLowerCase();
  const unreadCount=items.filter(item=>!item.read_at).length;
  const filtered=items.filter(item=>(!unreadOnly||!item.read_at)&&`${item.title} ${item.body} ${item.document?.number??""} ${item.document?.title??""} ${item.document?.discipline??""}`.toLocaleLowerCase().includes(query));
  const pages=Math.max(1,Math.ceil(filtered.length/MESSAGES_PER_PAGE));
  const currentPage=Math.min(page,pages);
  const start=(currentPage-1)*MESSAGES_PER_PAGE;
  const visible=filtered.slice(start,start+MESSAGES_PER_PAGE);
  const groups=groupByReceivedDate(visible);

  return <section className="ev-card min-w-0 overflow-hidden" aria-labelledby={`${id}-title`}>
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e7ecef] px-4 py-3 sm:px-5"><h2 id={`${id}-title`} className="text-base font-semibold">Your inbox</h2><span className="text-xs text-[#526675]">{items.length} latest · {unreadCount} unread</span></header>
    {items.length>0&&<div data-preview-safe className="space-y-3 border-b border-[#e7ecef] px-4 py-3 sm:px-5">
      <label htmlFor={`${id}-search`} className="ev-label">Search notifications</label>
      <div className="relative min-w-0"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-[#526675]"/><input id={`${id}-search`} type="search" aria-controls={`${id}-results`} className="ev-input min-h-11 min-w-0 pl-10" placeholder="Message, document or discipline" value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}}/></div>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter notifications" className="inline-flex rounded-xl border border-[#dfe6eb] bg-[#f6f8f9] p-1">
          <button type="button" aria-pressed={!unreadOnly} onClick={()=>{setUnreadOnly(false);setPage(1);}} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${!unreadOnly?"bg-white text-[#10243e] shadow-sm":"text-[#526675] hover:bg-white/60"}`}>All <span className="ml-1 text-xs">{items.length}</span></button>
          <button type="button" aria-pressed={unreadOnly} onClick={()=>{setUnreadOnly(true);setPage(1);}} className={`min-h-11 rounded-lg px-4 text-sm font-medium ${unreadOnly?"bg-white text-[#10243e] shadow-sm":"text-[#526675] hover:bg-white/60"}`}>Unread <span className="ml-1 text-xs">{unreadCount}</span></button>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-[#526675]">{pages>1?`Showing ${start+1}–${start+visible.length} of ${filtered.length} matching messages · ${items.length} loaded`:`${filtered.length} of ${items.length} loaded messages`}</p>
      </div>
    </div>}
    <div ref={results} id={`${id}-results`} role="region" aria-label="Notification results" tabIndex={-1} className="min-w-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#10243e]">
    {visible.length>0?<ul aria-label="Notifications">{groups.map((group,index)=><li key={`${group.key}-${index}`} className="min-w-0">
      <h3 className="border-y border-[#e7ecef] bg-[#f6f8f9] px-4 py-2 text-xs font-semibold text-[#526675] first:border-t-0 sm:px-5">{group.key==="unknown"?group.label:<time dateTime={group.key}>{group.label}</time>}</h3>
      <ul aria-label={`Notifications received ${group.label}`} className="divide-y divide-[#e7ecef]">{group.items.map(item=><li key={item.id} className="min-w-0">
      <Link href={`/app/notifications/${item.id}`} className="group flex min-h-11 min-w-0 items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-[#f4f7fb] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#10243e] motion-reduce:transition-none sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h4 className={`min-w-0 text-sm leading-6 [overflow-wrap:anywhere] ${item.read_at?"font-medium text-[#405566]":"font-semibold text-[#10243e]"}`}>{item.title}</h4>{!item.read_at&&<span className="shrink-0 rounded-md bg-[#eef3fa] px-2 py-0.5 text-xs font-medium text-[#10243e]">Unread</span>}</div>
          {item.document&&<div className="mt-1 min-w-0 text-xs leading-5 text-[#526675]"><p className="font-medium [overflow-wrap:anywhere]">{item.document.number}{item.document.discipline?` · ${item.document.discipline}`:""}</p><p className="[overflow-wrap:anywhere]">{item.document.title}</p></div>}
          <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm leading-6 text-[#526675] [overflow-wrap:anywhere]">{item.body}</p>
          <time dateTime={item.created_at} className="mt-2 block text-xs text-[#657889]">{item.receivedLabel}</time>
        </div>
        <ChevronRight size={17} aria-hidden="true" className="mt-1 shrink-0 text-[#718294] group-hover:text-[#10243e]"/>
      </Link>
    </li>)}</ul></li>)}</ul>:<PageState kind="empty" headingLevel={3} title={items.length?unreadOnly&&!query?"No unread notifications in the latest messages.":"No notifications match your filters.":"You have no notifications."}
      actions={items.length>0?<button type="button" data-preview-safe className="ev-button-secondary min-h-11" onClick={()=>{setSearch("");setUnreadOnly(false);setPage(1);}}>Show all loaded messages</button>:undefined}/>}
    </div>
    {pages>1&&<nav data-preview-safe aria-label="Notification pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ecef] px-4 py-3 sm:px-5">
      <p className="text-xs text-[#526675]">Page {currentPage} of {pages}</p>
      <div className="flex gap-2">
        <button type="button" aria-controls={`${id}-results`} className="ev-button-secondary min-h-11" disabled={currentPage===1} onClick={()=>{setPage(Math.max(1,currentPage-1));results.current?.focus();}}>Previous</button>
        <button type="button" aria-controls={`${id}-results`} className="ev-button-secondary min-h-11" disabled={currentPage===pages} onClick={()=>{setPage(Math.min(pages,currentPage+1));results.current?.focus();}}>Next</button>
      </div>
    </nav>}
  </section>;
}
