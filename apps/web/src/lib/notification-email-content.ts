import { sanitiseEmailHeaderText } from "@/lib/email-sender";

export type NotificationEmailInput = {
  recipientEmail: string;
  recipientName: string;
  organisationName: string;
  projectName?: string | null;
  kind: string;
  title: string;
  body: string;
  notificationUrl: string;
};

export function notificationEmailContent(input: NotificationEmailInput) {
  const organisationName = sanitiseEmailHeaderText(input.organisationName, "EngiCite");
  const title = sanitiseEmailHeaderText(input.title, "New project notification");
  const projectName = sanitiseEmailHeaderText(input.projectName, "Organisation workspace");
  const body = input.body.trim().slice(0, 4_000);
  const subject = sanitiseEmailHeaderText(`${organisationName}: ${title}`, "EngiCite notification");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#10243e">
    <p style="font-size:12px;font-weight:bold;letter-spacing:.12em;color:#e8733f">ENGICITE NOTIFICATION</p>
    <h1 style="font-size:24px;line-height:1.25">${escapeHtml(title)}</h1>
    <p>Hello ${escapeHtml(input.recipientName)},</p>
    <p><strong>${escapeHtml(organisationName)}</strong> sent you an update${input.projectName ? ` for <strong>${escapeHtml(projectName)}</strong>` : ""}.</p>
    <div style="border:1px solid #dfe7e3;border-radius:12px;padding:16px;margin:20px 0;background:#f8faf9">
      <p style="margin:0;line-height:1.65">${escapeHtml(body).replaceAll("\n", "<br/>")}</p>
    </div>
    <p><a href="${escapeHtml(input.notificationUrl)}" style="display:inline-block;background:#e8733f;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:bold">Open notification</a></p>
    <p style="font-size:12px;line-height:1.6;color:#617083">This transactional message was sent to ${escapeHtml(input.recipientEmail)} because this account is an active member of the ${escapeHtml(organisationName)} workspace. Open EngiCite to review the notification and related access.</p>
  </div>`;
  return { subject, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

