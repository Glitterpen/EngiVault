import { describe, expect, it } from "vitest";
import { notificationEmailContent } from "./notification-email-content";

describe("notification email content", () => {
  it("uses organisation and project identity", () => {
    const result = notificationEmailContent({
      recipientEmail: "engineer@example.com",
      recipientName: "Ada Engineer",
      organisationName: "Example EPC",
      projectName: "Export Pipeline FEED",
      kind: "revision_submitted",
      title: "Process submission received",
      body: "P-001 revision R01 is ready for review.",
      notificationUrl: "https://app.example.com/app/notifications/notice-id",
    });
    expect(result.subject).toBe("Example EPC: Process submission received");
    expect(result.html).toContain("Export Pipeline FEED");
    expect(result.html).toContain("Open notification");
  });

  it("escapes user-controlled notification text and email headers", () => {
    const result = notificationEmailContent({
      recipientEmail: "engineer@example.com",
      recipientName: "<script>alert(1)</script>",
      organisationName: "Example EPC\r\nBcc: attacker@example.com",
      projectName: null,
      kind: "revision_returned",
      title: "Returned\r\nBcc: attacker@example.com",
      body: "Review <img src=x onerror=alert(1)>",
      notificationUrl: "https://app.example.com/app/notifications/notice-id?x=<unsafe>",
    });
    expect(result.subject).not.toContain("\r");
    expect(result.subject).not.toContain("\n");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img");
    expect(result.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(result.html).toContain("&lt;unsafe&gt;");
  });
});

