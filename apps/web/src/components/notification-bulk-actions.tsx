"use client";

import { CheckCheck, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteAllNotifications, markNotificationsRead } from "@/app/app/workflow-actions";

export function NotificationBulkActions({ hasNotifications, hasUnread }: { hasNotifications: boolean; hasUnread: boolean }) {
  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <form action={markNotificationsRead} aria-label="Mark all notifications as read" className="min-w-0">
        <BulkButton disabled={!hasUnread} />
      </form>
      <form
        action={deleteAllNotifications}
        aria-label="Delete all notifications"
        className="min-w-0"
        onSubmit={(event) => {
          if (!window.confirm("Delete all your notifications? This cannot be undone.")) event.preventDefault();
        }}
      >
        <BulkButton disabled={!hasNotifications} destructive />
      </form>
    </div>
  );
}

function BulkButton({disabled,destructive=false}:{disabled:boolean;destructive?:boolean}) {
  const {pending}=useFormStatus();
  return <button type="submit" disabled={disabled||pending} aria-busy={pending}
    className={destructive
      ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dce2e9] bg-white px-4 py-2 text-sm font-semibold text-[#9b2c24] transition hover:border-[#efc7bb] hover:bg-[#fff7f4] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
      : "ev-button-secondary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"}>
    {destructive?<Trash2 size={16} aria-hidden="true"/>:<CheckCheck size={16} aria-hidden="true"/>}
    {pending?(destructive?"Deleting…":"Marking read…"):(destructive?"Delete all":"Mark all read")}
  </button>;
}
