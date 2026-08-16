"use client";

import { CheckCheck, Trash2 } from "lucide-react";
import { deleteAllNotifications, markNotificationsRead } from "@/app/app/workflow-actions";

export function NotificationBulkActions({ hasNotifications, hasUnread }: { hasNotifications: boolean; hasUnread: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={markNotificationsRead}>
        <button disabled={!hasUnread} className="ev-button-secondary disabled:cursor-not-allowed disabled:opacity-45">
          <CheckCheck size={16} /> Mark all read
        </button>
      </form>
      <form
        action={deleteAllNotifications}
        onSubmit={(event) => {
          if (!window.confirm("Delete all your notifications? This cannot be undone.")) event.preventDefault();
        }}
      >
        <button
          disabled={!hasNotifications}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 size={16} /> Delete all
        </button>
      </form>
    </div>
  );
}
