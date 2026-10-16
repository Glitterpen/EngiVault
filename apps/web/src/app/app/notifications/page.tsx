import {HelpTip} from "@/components/help-tip";
import { requireNotificationUser } from "@/lib/auth";
import { NotificationBulkActions } from "@/components/notification-bulk-actions";
import {loadNotificationDocumentContext} from "@/lib/notification-document-context";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {NotificationInbox} from "@/components/notification-inbox";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { supabase, user, preview } = await requireNotificationUser();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,kind,title,body,read_at,created_at,href")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const documentContext=await loadNotificationDocumentContext(supabase,error?[]:data??[]);

  return (
    <div className="mx-auto min-w-0 max-w-4xl space-y-5">
      <WorkspacePageHeading title="Notifications" context="Your latest project activity, in one place" help={<HelpTip label="Opening notifications">Select a message to preview it before opening a related project page. This inbox shows up to the 100 latest notifications; search and filters apply only to those loaded messages. Mark all read and Delete all apply to your entire notification inbox, including older messages.</HelpTip>} actions={!preview&&!error?<NotificationBulkActions
          hasNotifications={Boolean(data?.length)}
          hasUnread={Boolean(data?.some((item) => !item.read_at))}
        />:undefined}/>

      {query.error === "delete_all" && (
        <div role="alert" className="rounded-xl border border-[#efc7bb] bg-[#fff7f4] px-4 py-3 text-sm text-[#8b3d1f]">
          Notifications could not be deleted. Refresh the page and try again.
        </div>
      )}

        {error ? (
          <div role="alert" className="ev-card p-6">
            <h2 className="font-semibold">Notifications could not be loaded</h2>
            <p className="mt-2 text-sm text-[#617083]">Your inbox is temporarily unavailable. Please try again.</p>
            {/* A full reload intentionally retries this same URL instead of reusing its failed route payload. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/app/notifications" className="ev-button-secondary mt-4 min-h-11 w-full sm:w-auto">Retry notifications</a>
          </div>
        ) : <NotificationInbox items={(data??[]).map(item=>({id:item.id,kind:item.kind,title:item.title,body:item.body,read_at:item.read_at,created_at:item.created_at,receivedLabel:`${new Date(item.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC`,document:documentContext.get(item.id)??null}))}/>}
    </div>
  );
}
