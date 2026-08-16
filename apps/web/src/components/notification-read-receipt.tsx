"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markNotificationRead } from "@/app/app/workflow-actions";

export function NotificationReadReceipt({
  notificationId,
  unread,
}: {
  notificationId: string;
  unread: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!unread) return;
    let active = true;

    void markNotificationRead(notificationId).then((result) => {
      if (active && result.ok) router.refresh();
    }).catch(() => undefined);

    return () => {
      active = false;
    };
  }, [notificationId, router, unread]);

  return null;
}
