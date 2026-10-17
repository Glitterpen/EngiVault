import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import NotificationPreviewPage from "./page";
import {requireNotificationUser} from "@/lib/auth";
import {NotificationReadReceipt} from "@/components/notification-read-receipt";
import {loadNotificationDocumentContext} from "@/lib/notification-document-context";

vi.mock("@/lib/auth",()=>({requireNotificationUser:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found");}}));
vi.mock("@/app/app/workflow-actions",()=>({clearNotification:vi.fn()}));
vi.mock("@/components/notification-read-receipt",()=>({NotificationReadReceipt:vi.fn(()=>null)}));
vi.mock("@/lib/notification-document-context",()=>({loadNotificationDocumentContext:vi.fn()}));
vi.mock("@/components/help-tip",()=>({HelpTip:({children}:{children:React.ReactNode})=><span>{children}</span>}));
const notificationId="11111111-1111-4111-8111-111111111111",organisationId="22222222-2222-4222-8222-222222222222",projectId="33333333-3333-4333-8333-333333333333";
const href=`/app/${organisationId}/projects/${projectId}/reviews`;
const original={id:notificationId,organisation_id:organisationId,project_id:projectId,kind:"review",title:"Document accepted",body:"Customer document body\nSecond line of context",href,read_at:null as string|null,created_at:"2026-10-17T12:00:00Z"};
let row:typeof original|null;
let access:{project_id:string}|null;
let preview:boolean;
const from=vi.fn();
const memberClient={from};
const notificationQuery={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
const accessQuery={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
beforeEach(()=>{
  vi.clearAllMocks();row={...original};access={project_id:projectId};preview=false;
  for(const query of [notificationQuery,accessQuery]){query.select.mockReturnValue(query);query.eq.mockReturnValue(query);}
  notificationQuery.maybeSingle.mockImplementation(async()=>({data:row}));accessQuery.maybeSingle.mockImplementation(async()=>({data:access}));
  from.mockImplementation((table:string)=>table==="notifications"?notificationQuery:accessQuery);
  vi.mocked(requireNotificationUser).mockImplementation(async()=>({supabase:memberClient,user:{id:"current-member"},preview} as never));
  vi.mocked(loadNotificationDocumentContext).mockResolvedValue(new Map());
});
afterEach(cleanup);
const page=(error?:string,id=notificationId)=>NotificationPreviewPage({params:Promise.resolve({notificationId:id}),searchParams:Promise.resolve({error})});

it("preserves authenticated notification ownership and safe scoped destination checks",async()=>{
  render(await page());expect(requireNotificationUser).toHaveBeenCalledOnce();expect(from.mock.calls).toEqual([["notifications"],["project_access"]]);
  expect(notificationQuery.select).toHaveBeenCalledExactlyOnceWith("id,organisation_id,project_id,kind,title,body,href,read_at,created_at");
  expect(notificationQuery.eq.mock.calls).toEqual([["id",notificationId],["recipient_user_id","current-member"]]);expect(accessQuery.select).toHaveBeenCalledExactlyOnceWith("project_id");expect(accessQuery.eq.mock.calls).toEqual([["organisation_id",organisationId],["project_id",projectId]]);
  expect(screen.getByRole("heading",{level:1,name:original.title})).toBeTruthy();expect(screen.getByRole("article",{name:"Notification message"}).textContent).toContain("Customer document body");
  expect(screen.getByRole("link",{name:"Open related project page"}).getAttribute("href")).toBe(href);expect(vi.mocked(NotificationReadReceipt).mock.calls[0][0]).toEqual({notificationId,unread:true});
  const form=screen.getByRole("form",{name:"Mark this notification as read"}) as HTMLFormElement;
  expect(Object.fromEntries(new FormData(form))).toEqual({notificationId});expect(screen.getByRole("button",{name:"Mark as read now"}).classList.contains("min-h-11")).toBe(true);
});
it("keeps read messages readable without offering redundant mark-read mutation",async()=>{
  row={...original,read_at:"2026-10-17T12:05:00Z"};render(await page());expect(screen.queryByRole("form")).toBeNull();expect(vi.mocked(NotificationReadReceipt).mock.calls[0][0]).toEqual({notificationId,unread:false});
});
it("does not mark or clear a team member's notification in audited preview",async()=>{
  preview=true;render(await page());expect(NotificationReadReceipt).not.toHaveBeenCalled();expect(screen.queryByRole("form")).toBeNull();
  expect(document.body.textContent).toContain("Opening it does not mark it as read for the team member");expect(screen.getByRole("link",{name:"Open related project page"})).toBeTruthy();
});
it("retains unavailable destination guidance when project access is absent",async()=>{
  access=null;render(await page());expect(screen.queryByRole("link",{name:"Open related project page"})).toBeNull();expect(screen.getByText(/related project page is no longer available/)).toBeTruthy();
  expect(loadNotificationDocumentContext).not.toHaveBeenCalled();expect(screen.queryByRole("region",{name:"Related document"})).toBeNull();
});
it.each(["https://example.test/project","//example.test/project",`/app/${organisationId}/projects/${projectId}/../settings`])("never exposes an unsafe notification href as a destination: %s",async(unsafe)=>{
  row={...original,href:unsafe};render(await page());expect(from.mock.calls).toEqual([["notifications"]]);expect(screen.queryByRole("link",{name:"Open related project page"})).toBeNull();
  expect(loadNotificationDocumentContext).not.toHaveBeenCalled();
});
it.each([false,true])("preserves authorised document identity with the existing member client (preview %s)",async(isPreview)=>{
  preview=isPreview;
  const documentHref=`/app/${organisationId}/projects/${projectId}/documents/44444444-4444-4444-8444-444444444444`;
  row={...original,href:documentHref};
  vi.mocked(loadNotificationDocumentContext).mockResolvedValue(new Map([[notificationId,{number:"NWC-CRX-LST-INS-0001-00",title:"Preliminary I/O List",discipline:"Instrumentation"}]]));
  render(await page());
  expect(loadNotificationDocumentContext).toHaveBeenCalledExactlyOnceWith(memberClient,[{id:notificationId,href:documentHref}]);
  const context=screen.getByRole("region",{name:"Related document"});
  expect(context.textContent).toContain("NWC-CRX-LST-INS-0001-00");expect(context.textContent).toContain("Instrumentation");
  expect(screen.getByRole("heading",{level:2,name:"Preliminary I/O List"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"Open related project page"}).getAttribute("href")).toBe(documentHref);
  expect(NotificationReadReceipt).toHaveBeenCalledTimes(isPreview?0:1);expect(screen.queryByRole("form")!==null).toBe(!isPreview);
});
it("keeps the notification readable when optional document context is inaccessible or unavailable",async()=>{
  row={...original,href:`/app/${organisationId}/projects/${projectId}/documents/44444444-4444-4444-8444-444444444444`};
  render(await page());
  expect(loadNotificationDocumentContext).toHaveBeenCalledOnce();expect(screen.queryByRole("region",{name:"Related document"})).toBeNull();
  expect(screen.getByText(/Customer document body/)).toBeTruthy();expect(screen.getByRole("link",{name:"Open related project page"})).toBeTruthy();
});
it("keeps the existing clear failure visible and the message readable",async()=>{
  render(await page("clear"));expect(screen.getByRole("alert").textContent).toBe("The message could not be cleared. Please try again.");expect(screen.getByText(/Customer document body/)).toBeTruthy();
});
it("rejects malformed notification identifiers before reading authentication or data",async()=>{
  await expect(page(undefined,"invalid-id")).rejects.toThrow("not found");expect(requireNotificationUser).not.toHaveBeenCalled();expect(from).not.toHaveBeenCalled();
});
it("does not render a missing or unauthorised notification",async()=>{
  row=null;await expect(page()).rejects.toThrow("not found");expect(from.mock.calls).toEqual([["notifications"]]);expect(NotificationReadReceipt).not.toHaveBeenCalled();
  expect(loadNotificationDocumentContext).not.toHaveBeenCalled();
});
