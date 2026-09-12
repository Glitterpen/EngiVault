import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import NotificationsPage from "./page";

const mocks=vi.hoisted(()=>({limit:vi.fn(),preview:false}));
vi.mock("@/lib/auth",()=>({requireNotificationUser:async()=>({
  user:{id:"member"},preview:mocks.preview,
  supabase:{from:()=>({select:()=>({eq:()=>({order:()=>({limit:mocks.limit})})})})},
})}));
vi.mock("@/components/notification-bulk-actions",()=>({NotificationBulkActions:()=> <div>Bulk actions</div>}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
afterEach(cleanup);
beforeEach(()=>{mocks.preview=false;});

it("shows retry instead of an empty inbox when the query fails",async()=>{
  mocks.limit.mockResolvedValue({data:null,error:{message:"private diagnostic"}});
  render(await NotificationsPage({searchParams:Promise.resolve({})}));
  expect(screen.getByRole("alert").textContent).toContain("Notifications could not be loaded");
  expect(screen.getByRole("link",{name:"Retry notifications"}).getAttribute("href")).toBe("/app/notifications");
  expect(screen.queryByText("You have no notifications.")).toBeNull();
  expect(screen.queryByText("Bulk actions")).toBeNull();
  expect(screen.queryByText("private diagnostic")).toBeNull();
});
it("shows the empty state only for a successful empty response",async()=>{
  mocks.limit.mockResolvedValue({data:[],error:null});
  render(await NotificationsPage({searchParams:Promise.resolve({})}));
  expect(screen.getByText("You have no notifications.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});
it("keeps notification preview read-only",async()=>{
  mocks.preview=true;
  mocks.limit.mockResolvedValue({data:[{id:"notice",title:"Document accepted",body:"Ready for transmission",created_at:"2026-09-12T12:00:00Z",read_at:null,kind:"review"}],error:null});
  render(await NotificationsPage({searchParams:Promise.resolve({})}));
  expect(screen.getByRole("link",{name:/Document accepted/})).toBeTruthy();
  expect(screen.queryByText("Bulk actions")).toBeNull();
});
