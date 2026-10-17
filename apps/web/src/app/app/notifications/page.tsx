import {HelpTip} from "@/components/help-tip";
import { requireNotificationUser } from "@/lib/auth";
import { NotificationBulkActions } from "@/components/notification-bulk-actions";
import {loadNotificationDocumentContext,type NotificationDocumentContext} from "@/lib/notification-document-context";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {NotificationInbox} from "@/components/notification-inbox";
import {browseHref,browsePage,browseSearch,browseTextFilter,browseValue,readBrowsePage,type BrowseQuery} from "@/lib/read-only-browse";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<BrowseQuery> }) {
  const query = await searchParams;
  const { supabase, user, preview } = await requireNotificationUser();
  const q=browseSearch(query.q),unreadOnly=browseValue(query.unread)==="1",page=browsePage(query.page);
  type Notice={id:string;kind:string;title:string;body:string;read_at:string|null;created_at:string;href:string|null};
  let result,allCount=0,unreadCount=0,error=false;
  try{
    const [loaded,all,unread]=await Promise.all([
      readBrowsePage<Notice>(async(start,end)=>{
        let request=supabase.from("notifications").select("id,kind,title,body,read_at,created_at,href",{count:"exact"})
          .eq("recipient_user_id",user.id).order("created_at",{ascending:false}).order("id",{ascending:false}).range(start,end);
        if(unreadOnly)request=request.is("read_at",null);
        if(q)request=request.or(browseTextFilter(q,["title","body","kind"]));
        const response=await request;return {...response,data:response.data as Notice[]|null};
      },page),
      supabase.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_user_id",user.id).limit(1),
      supabase.from("notifications").select("id",{count:"exact",head:true}).eq("recipient_user_id",user.id).is("read_at",null).limit(1),
    ]);
    if(all.error||unread.error||typeof all.count!=="number"||!Number.isSafeInteger(all.count)||all.count<0||typeof unread.count!=="number"||!Number.isSafeInteger(unread.count)||unread.count<0||unread.count>all.count)throw new Error("Inbox unavailable");
    result=loaded;allCount=all.count;unreadCount=unread.count;
  }catch{error=true;}
  const data=result?.items??[];

  let documentContext=new Map<string,NotificationDocumentContext>();
  // Related document labels are optional. Preserve the authorised inbox if
  // their existing authenticated/preview lookup is temporarily unavailable.
  try{documentContext=await loadNotificationDocumentContext(supabase,error?[]:data);}catch{/* Keep original messages without optional document labels. */}

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-5">
      <WorkspacePageHeading title="Notifications" context="Your project activity, in one place" help={<HelpTip label="Notification inbox actions">Mark all read and Delete all affect your entire inbox, including messages outside the current search or page.</HelpTip>} actions={!preview&&!error?<NotificationBulkActions
          hasNotifications={allCount>0}
          hasUnread={unreadCount>0}
        />:undefined}/>

      {browseValue(query.error) === "delete_all" && (
        <div role="alert" className="rounded-xl border border-[#efc7bb] bg-[#fff7f4] px-4 py-3 text-sm text-[#8b3d1f]">
          Notifications could not be deleted. Refresh the page and try again.
        </div>
      )}

        {error ? (
          <div role="alert" className="ev-card p-6">
            <h2 className="font-semibold">Notifications could not be loaded</h2>
            <p className="mt-2 text-sm text-[#617083]">Your inbox is temporarily unavailable. Please try again.</p>
            {/* A full reload intentionally retries this same URL instead of reusing its failed route payload. */}
            <a href={browseHref("/app/notifications",{q,unread:unreadOnly?"1":"",page})} className="ev-button-secondary mt-4 min-h-11 w-full sm:w-auto">Retry notifications</a>
          </div>
        ) : <NotificationInbox paging={{q,unreadOnly,page:result!.page,pages:result!.pages,total:result!.total,allCount,unreadCount}} items={data.map(item=>({id:item.id,kind:item.kind,title:item.title,body:item.body,read_at:item.read_at,created_at:item.created_at,receivedLabel:`${new Date(item.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC`,document:documentContext.get(item.id)??null}))}/>}
    </div>
  );
}
