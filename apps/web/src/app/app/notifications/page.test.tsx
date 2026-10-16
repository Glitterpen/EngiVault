import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import NotificationsPage from "./page";
import {NotificationBulkActions} from "@/components/notification-bulk-actions";

const mocks=vi.hoisted(()=>({from:vi.fn(),select:vi.fn(),eq:vi.fn(),order:vi.fn(),limit:vi.fn(),preview:false,enrich:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireNotificationUser:async()=>({user:{id:"member"},preview:mocks.preview,supabase:{from:mocks.from}})}));
vi.mock("@/lib/notification-document-context",()=>({loadNotificationDocumentContext:mocks.enrich}));
vi.mock("@/components/notification-bulk-actions",()=>({NotificationBulkActions:vi.fn(()=> <div>Bulk actions</div>)}));
vi.mock("@/components/help-tip",()=>({HelpTip:({children}:{children:React.ReactNode})=><span>{children}</span>}));
afterEach(cleanup);
beforeEach(()=>{
  vi.clearAllMocks();mocks.preview=false;
  mocks.from.mockReturnValue({select:mocks.select});mocks.select.mockReturnValue({eq:mocks.eq});mocks.eq.mockReturnValue({order:mocks.order});mocks.order.mockReturnValue({limit:mocks.limit});mocks.enrich.mockResolvedValue(new Map());
});
const notice={id:"notice",title:"Document accepted",body:"Ready for transmission",created_at:"2026-09-12T12:00:00Z",read_at:null,kind:"review",href:"/app/org/projects/project/documents/document"};
const page=(error?:string)=>NotificationsPage({searchParams:Promise.resolve({error})});

it("shows retry instead of an empty inbox when the query fails",async()=>{
  mocks.limit.mockResolvedValue({data:null,error:{message:"private diagnostic"}});
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Notifications could not be loaded");
  expect(screen.getByRole("link",{name:"Retry notifications"}).getAttribute("href")).toBe("/app/notifications");
  expect(screen.queryByText("You have no notifications.")).toBeNull();
  expect(screen.queryByText("Bulk actions")).toBeNull();
  expect(screen.queryByText("private diagnostic")).toBeNull();
  expect(mocks.enrich.mock.calls[0][1]).toEqual([]);
});
it("shows the empty state only for a successful empty response",async()=>{
  mocks.limit.mockResolvedValue({data:[],error:null});
  render(await page());
  expect(screen.getByText("You have no notifications.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:false,hasUnread:false});
});
it("keeps the exact recipient, newest-first order and latest-100 query",async()=>{
  mocks.limit.mockResolvedValue({data:[notice],error:null});render(await page());
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("notifications");expect(mocks.select).toHaveBeenCalledExactlyOnceWith("id,kind,title,body,read_at,created_at,href");
  expect(mocks.eq).toHaveBeenCalledExactlyOnceWith("recipient_user_id","member");expect(mocks.order).toHaveBeenCalledExactlyOnceWith("created_at",{ascending:false});expect(mocks.limit).toHaveBeenCalledExactlyOnceWith(100);
  expect(screen.getByRole("heading",{level:1,name:"Notifications"})).toBeTruthy();expect(screen.getByRole("link",{name:/Document accepted/}).getAttribute("href")).toBe("/app/notifications/notice");
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:true,hasUnread:true});
  expect(screen.getByText("12 Sept 2026, 12:00 UTC")).toBeTruthy();
});
it("keeps notification preview read-only",async()=>{
  mocks.preview=true;
  mocks.limit.mockResolvedValue({data:[notice],error:null});
  render(await page());
  expect(screen.getByRole("link",{name:/Document accepted/})).toBeTruthy();
  expect(screen.queryByText("Bulk actions")).toBeNull();
  expect(NotificationBulkActions).not.toHaveBeenCalled();
});
it("preserves optional authorised document context for the joined inbox row",async()=>{
  mocks.limit.mockResolvedValue({data:[notice],error:null});mocks.enrich.mockResolvedValue(new Map([["notice",{number:"DOC-100",title:"MTO list",discipline:"Mechanical"}]]));render(await page());
  expect(mocks.enrich.mock.calls[0][1]).toEqual([notice]);expect(screen.getByText("DOC-100 · Mechanical")).toBeTruthy();expect(screen.getByText("MTO list")).toBeTruthy();
});
it("keeps deletion failure visible and explains that local filters do not limit bulk actions",async()=>{
  mocks.limit.mockResolvedValue({data:[{...notice,read_at:"2026-10-01T00:00:00Z"}],error:null});render(await page("delete_all"));
  expect(screen.getByRole("alert").textContent).toContain("Notifications could not be deleted");expect(document.body.textContent).toContain("100 latest notifications");expect(document.body.textContent).toContain("entire notification inbox, including older messages");
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:true,hasUnread:false});
});
