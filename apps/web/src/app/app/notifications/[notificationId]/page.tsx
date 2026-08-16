import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bell, CheckCheck, ExternalLink, Info } from "lucide-react";
import { z } from "zod";
import { clearNotification } from "@/app/app/workflow-actions";
import { requireUser } from "@/lib/auth";
import { notificationDestination } from "@/lib/notification-links";

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

  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notifications")
    .select("id,organisation_id,project_id,kind,title,body,href,read_at,created_at")
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id)
    .maybeSingle();
  if (!data) notFound();

  const notification = data as NotificationRow;
  let destination = notificationDestination({
    href: notification.href,
    organisationId: notification.organisation_id,
    projectId: notification.project_id,
  });

  if (destination && notification.organisation_id && notification.project_id) {
    const { data: access } = await supabase
      .from("project_access")
      .select("project_id")
      .eq("organisation_id", notification.organisation_id)
      .eq("project_id", notification.project_id)
      .maybeSingle();
    if (!access) destination = null;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/app/notifications" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]">
        <ArrowLeft size={16} /> Return to notifications
      </Link>

      <article className="ev-card mt-6 overflow-hidden">
        <header className="border-b border-[#e4e9ee] bg-[#f8fafb] px-5 py-5 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.14em] text-[#e8733f]"><Bell size={15} /> Message preview</p>
            <span className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${notification.read_at ? "bg-[#edf1f4] text-[#617083]" : "bg-[#fff0e9] text-[#a5452f]"}`}>
              {notification.read_at ? "Read" : "Unread"}
            </span>
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-[-.03em] sm:text-3xl">{notification.title}</h1>
          <p className="mt-2 text-xs text-[#617083]">Received {new Date(notification.created_at).toLocaleString()}</p>
        </header>

        <div className="px-5 py-6 sm:px-7 sm:py-8">
          <p className="whitespace-pre-wrap text-base leading-8 text-[#35485d]">{notification.body}</p>

          {query.error === "clear" && (
            <p role="alert" className="mt-6 rounded-xl border border-[#f1c9b8] bg-[#fff6f2] p-4 text-sm text-[#8f3e2c]">
              The message could not be cleared. Please try again.
            </p>
          )}

          {!destination && notification.href && (
            <div className="mt-6 flex gap-3 rounded-xl border border-[#dfe7e3] bg-[#f7faf8] p-4 text-sm leading-6 text-[#617083]">
              <Info size={18} className="mt-0.5 shrink-0 text-[#0c5b45]" />
              <p>The related project page is no longer available to your account. The notification remains here for reference.</p>
            </div>
          )}

          <div className="mt-8 border-t border-[#e4e9ee] pt-6">
            <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[#617083]">Choose what happens next</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={clearNotification}>
                <input type="hidden" name="notificationId" value={notification.id} />
                <button className="ev-button"><CheckCheck size={16} /> Clear notification</button>
              </form>
              <Link href="/app/notifications" className="ev-button-secondary"><ArrowLeft size={16} /> Return without clearing</Link>
              {destination && (
                <Link href={destination} className="ev-button-secondary">Open related project page <ExternalLink size={15} /></Link>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-[#617083]">Clearing marks this message as read and removes it from the unread notification count. It remains in your message history.</p>
          </div>
        </div>
      </article>
    </div>
  );
}
