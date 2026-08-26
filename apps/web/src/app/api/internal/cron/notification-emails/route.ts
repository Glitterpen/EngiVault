import { sendNotificationEmail } from "@/lib/notification-email";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type NotificationEmailRow = {
  delivery_id: string;
  notification_id: string;
  recipient_email: string;
  recipient_name: string;
  organisation_name: string;
  project_name: string | null;
  notification_kind: string;
  notification_title: string;
  notification_body: string;
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Valid cron authorization is required." } },
      { status: 401 },
    );
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: { code: "SERVICE_CONFIGURATION", message: "Notification email service credentials are not configured." } },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("claim_notification_email_deliveries", {
    batch_size: 25,
  });
  if (error) {
    return Response.json(
      { error: { code: "NOTIFICATION_EMAIL_QUERY_FAILED", message: "Notification emails could not be prepared.", reference: error.code } },
      { status: 503 },
    );
  }

  const rows = (data ?? []) as NotificationEmailRow[];
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const base = configuredAppUrl ?? (vercelHost ? `https://${vercelHost}` : new URL(request.url).origin);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const notificationUrl = new URL(`/app/notifications/${row.notification_id}`, base).toString();
    const result = await sendNotificationEmail({
      recipientEmail: row.recipient_email,
      recipientName: row.recipient_name,
      organisationName: row.organisation_name,
      projectName: row.project_name,
      kind: row.notification_kind,
      title: row.notification_title,
      body: row.notification_body,
      notificationUrl,
    });
    const completion = await admin.rpc("finish_notification_email_delivery", {
      target_delivery: row.delivery_id,
      delivered: result.sent,
      provider_reference: result.sent ? result.providerMessageId ?? null : null,
      failure_code: result.sent ? null : result.reason,
    });
    if (completion.error) {
      console.error("[notification-email] Delivery completion could not be recorded", {
        deliveryId: row.delivery_id,
        reference: completion.error.code,
      });
    }
    if (result.sent) sent += 1;
    else failed += 1;
  }

  return Response.json(
    { processed: rows.length, emailSent: sent, emailFailed: failed },
    { headers: { "cache-control": "no-store" } },
  );
}

