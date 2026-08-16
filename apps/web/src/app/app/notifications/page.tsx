import Link from "next/link";
import { Bell, ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotificationBulkActions } from "@/components/notification-bulk-actions";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .from("notifications")
    .select("id,kind,title,body,read_at,created_at")
    .eq("recipient_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Your activity</p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold"><Bell /> Notifications</h1>
          <p className="mt-2 text-sm text-[#617083]">Select a message to preview it before opening any related project page.</p>
        </div>
        <NotificationBulkActions
          hasNotifications={Boolean(data?.length)}
          hasUnread={Boolean(data?.some((item) => !item.read_at))}
        />
      </div>

      {query.error === "delete_all" && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          Notifications could not be deleted. Refresh the page and try again.
        </div>
      )}

      <div className="mt-6 space-y-3">
        {data?.length ? data.map((item) => (
          <Link
            href={`/app/notifications/${item.id}`}
            key={item.id}
            className={`ev-card group block w-full p-5 text-left transition hover:border-[#ed7138] hover:shadow-md ${item.read_at ? "opacity-70" : "border-l-4 border-l-[#e8733f]"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{item.title}</h2>
                <p className={`mt-2 whitespace-pre-line text-sm leading-6 text-[#617083] ${item.kind === "revision_submitted" ? "line-clamp-5" : "line-clamp-2"}`}>{item.body}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="hidden text-xs text-[#617083] sm:inline">{new Date(item.created_at).toLocaleString()}</span>
                <ChevronRight size={18} className="text-[#8d9baa] transition group-hover:translate-x-0.5 group-hover:text-[#e8733f]" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 sm:hidden">
              <span className="text-xs text-[#617083]">{new Date(item.created_at).toLocaleString()}</span>
            </div>
            {!item.read_at && (
              <span className="mt-3 inline-flex rounded-full bg-[#fff0e9] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[#a5452f]">
                Unread · preview message
              </span>
            )}
          </Link>
        )) : (
          <div className="ev-card p-10 text-center text-[#617083]">You have no notifications.</div>
        )}
      </div>
    </div>
  );
}
