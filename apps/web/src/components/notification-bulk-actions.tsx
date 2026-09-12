"use client";

import { CheckCheck, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { deleteAllNotifications, markNotificationsRead } from "@/app/app/workflow-actions";

export function NotificationBulkActions({ hasNotifications, hasUnread }: { hasNotifications: boolean; hasUnread: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={markNotificationsRead}>
        <BulkButton disabled={!hasUnread} />
      </form>
      <form
        action={deleteAllNotifications}
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
      ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
      : "ev-button-secondary disabled:cursor-not-allowed disabled:opacity-45"}>
    {destructive?<Trash2 size={16}/>:<CheckCheck size={16}/>}
    {pending?(destructive?"Deleting…":"Marking read…"):(destructive?"Delete all":"Mark all read")}
  </button>;
}
