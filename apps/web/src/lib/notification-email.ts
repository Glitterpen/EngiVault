import "server-only";

import { formatOrganisationSender } from "@/lib/email-sender";
import {
  notificationEmailContent,
  type NotificationEmailInput,
} from "@/lib/notification-email-content";

export async function sendNotificationEmail(input: NotificationEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const configuredFrom = process.env.NOTIFICATION_FROM_EMAIL ?? process.env.INVITATION_FROM_EMAIL;
  if (!apiKey || !configuredFrom) {
    return { sent: false as const, reason: "not_configured" as const };
  }

  const { subject, html } = notificationEmailContent(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: formatOrganisationSender(configuredFrom, input.organisationName),
        to: [input.recipientEmail],
        subject,
        html,
      }),
    });
    if (!response.ok) {
      return { sent: false as const, reason: `provider_${response.status}` as const };
    }
    const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return {
      sent: true as const,
      providerMessageId: typeof payload?.id === "string" ? payload.id : undefined,
    };
  } catch {
    return { sent: false as const, reason: "network_error" as const };
  }
}

