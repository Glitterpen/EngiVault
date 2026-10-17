import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCheck, ExternalLink, Info } from "lucide-react";
import { z } from "zod";
import { clearNotification } from "@/app/app/workflow-actions";
import { NotificationReadReceipt } from "@/components/notification-read-receipt";
import { requireNotificationUser } from "@/lib/auth";
import { notificationDestination } from "@/lib/notification-links";
import { loadNotificationDocumentContext,type NotificationDocumentContext } from "@/lib/notification-document-context";
import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {ReadUnavailable} from "@/components/read-unavailable";

type NotificationRow = {
  id: string;
  organisation_id: string | null;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export default async function NotificationPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ notificationId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ notificationId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(notificationId).success) notFound();

  const { supabase, user, preview } = await requireNotificationUser();
  const retryHref=`/app/notifications/${notificationId}`;
  let read:{data:unknown;error?:unknown};
  try{
    read=await supabase.from("notifications")
      .select("id,organisation_id,project_id,kind,title,body,href,read_at,created_at")
      .eq("id",notificationId).eq("recipient_user_id",user.id).maybeSingle();
  }catch{
    return <ReadUnavailable title="Notification could not be loaded" href={retryHref}/>;
  }
  if(read.error)return <ReadUnavailable title="Notification could not be loaded" href={retryHref}/>;
  const {data}=read;
  if (!data) notFound();

  const notification = data as NotificationRow;
  let destination = notificationDestination({
    href: notification.href,
    organisationId: notification.organisation_id,
    projectId: notification.project_id,
  });

  let destinationReadFailed=false;
  if (destination && notification.organisation_id && notification.project_id) {
    try{
      const {data:access,error:accessError}=await supabase.from("project_access")
        .select("project_id").eq("organisation_id",notification.organisation_id)
        .eq("project_id",notification.project_id).maybeSingle();
      destinationReadFailed=Boolean(accessError);
      if(accessError||!access)destination=null;
    }catch{
      destinationReadFailed=true;
      destination=null;
    }
  }

  // Enrich only the validated, accessible destination, using the same member
  // client as the message. Optional document context must never widen access.
  let documentContext:NotificationDocumentContext|undefined;
  try{
    documentContext=destination
      ?(await loadNotificationDocumentContext(supabase,[{id:notification.id,href:destination}])).get(notification.id)
      :undefined;
  }catch{
    // Optional enrichment cannot turn an already authorised message into an error.
    documentContext=undefined;
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-5">
      {!preview&&<NotificationReadReceipt notificationId={notification.id} unread={!notification.read_at} />}
      <Link href="/app/notifications" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#10243e] transition hover:text-[#0b1b30]">
        <ArrowLeft size={16} aria-hidden="true"/> Return to notifications
      </Link>
      <div className="min-w-0 [&_h1]:[overflow-wrap:anywhere]"><WorkspacePageHeading title={notification.title} context={<><time dateTime={notification.created_at}>Received {new Date(notification.created_at).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC"})} UTC</time> · {notification.read_at?"Read":"Unread"}</>} help={<HelpTip label="Notification read status">{preview?"Read-only preview: this message remains unchanged. Opening it does not mark it as read for the team member.":"Opening this message marks it as read automatically. The unread count decreases by one and disappears when no unread messages remain."}</HelpTip>}/></div>
      <article className="ev-card min-w-0 overflow-hidden" aria-label="Notification message">
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          {documentContext && (
            <section aria-label="Related document" className="mb-5 min-w-0 rounded-xl border border-[#dfe6ee] bg-[#f7f9fc] p-4">
              <p className="text-xs font-medium text-[#617083]">Related document</p>
              <p className="mt-1 text-xs leading-6 text-[#35485d] [overflow-wrap:anywhere]">
                <span className="font-mono font-semibold">{documentContext.number}</span>
                {documentContext.discipline && <span> · {documentContext.discipline}</span>}
              </p>
              <h2 className="mt-1 text-sm font-semibold leading-6 text-[#10243e] [overflow-wrap:anywhere]">{documentContext.title}</h2>
            </section>
          )}
          <p className="whitespace-pre-wrap text-sm leading-7 text-[#35485d] [overflow-wrap:anywhere] sm:text-base">{notification.body}</p>

          {query.error === "clear" && (
            <p role="alert" className="mt-6 rounded-xl border border-[#f1c9b8] bg-[#fff6f2] p-4 text-sm text-[#8f3e2c]">
              The message could not be cleared. Please try again.
            </p>
          )}

          {destinationReadFailed ? <div role="alert" className="mt-5 rounded-xl border border-[#e3ccb7] bg-[#fffaf5] p-3 text-sm leading-6 text-[#7c431f]">
            <p>The related project page could not be verified. Your notification remains available.</p>
            <a href={retryHref} data-preview-safe className="mt-1 inline-flex min-h-11 items-center rounded-lg font-semibold underline">Retry related page check</a>
          </div> : !destination && notification.href && (
            <div className="mt-5 flex gap-3 rounded-xl border border-[#d6e0ed] bg-[#f7f9fc] p-3 text-sm leading-6 text-[#617083]">
              <Info size={18} className="mt-0.5 shrink-0 text-[#10243e]" aria-hidden="true"/>
              <p>The related project page is no longer available to your account. The notification remains here for reference.</p>
            </div>
          )}

        </div>
          <footer className="border-t border-[#e4e9ee] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {!preview&&!notification.read_at && (
                <form action={clearNotification} aria-label="Mark this notification as read">
                  <input type="hidden" name="notificationId" value={notification.id} />
                  <button className="ev-button-secondary min-h-11 w-full sm:w-auto"><CheckCheck size={16} aria-hidden="true"/> Mark as read now</button>
                </form>
              )}
              <Link href="/app/notifications" className="ev-button-secondary min-h-11 w-full sm:w-auto"><ArrowLeft size={16} aria-hidden="true"/> Return to notifications</Link>
              {destination && (
                <Link href={destination} className="ev-button min-h-11 w-full sm:w-auto">{documentContext?"Open related document":"Open related project page"} <ExternalLink size={15} aria-hidden="true"/></Link>
              )}
            </div>
          </footer>
      </article>
    </div>
  );
}
