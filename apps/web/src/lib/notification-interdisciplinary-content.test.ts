import {expect,it} from "vitest";
import {notificationEmailContent} from "./notification-email-content";
it.each(["interdisciplinary_comment","interdisciplinary_query"])("includes the full coordination message safely in %s email",kind=>{
  const body="MEC-001 · Rev IFR · Mechanical\nQuery from Engineer:\nPlease confirm <script>alert(1)</script> & the isolation boundary.\nUse the updated design notes.";
  const result=notificationEmailContent({recipientEmail:"engineer@example.test",recipientName:"Responsible Engineer",organisationName:"Project Organisation",projectName:"Coordination Project",kind,title:"Interdisciplinary query received",body,notificationUrl:"https://app.engicite.com/app/notifications/message"});
  expect(result.html).toContain("MEC-001 · Rev IFR · Mechanical<br/>");expect(result.html).toContain("Please confirm &lt;script&gt;alert(1)&lt;/script&gt; &amp; the isolation boundary.");expect(result.html).toContain("Use the updated design notes.");expect(result.html).not.toContain("<script>");
});
