import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NotificationBulkActions} from "./notification-bulk-actions";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {deleteAllNotifications,markNotificationsRead} from "@/app/app/workflow-actions";
const state=vi.hoisted(()=>({pending:false}));
vi.mock("react-dom",async(importOriginal)=>({...await importOriginal<typeof import("react-dom")>(),useFormStatus:()=>({pending:state.pending})}));
vi.mock("@/app/app/workflow-actions",()=>({deleteAllNotifications:vi.fn(),markNotificationsRead:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
afterEach(()=>{cleanup();vi.restoreAllMocks();});
beforeEach(()=>{state.pending=false;});
it("disables actions for an empty inbox",()=>{
  render(<NotificationBulkActions hasNotifications={false} hasUnread={false}/>);
  expect((screen.getByRole("button",{name:"Mark all read"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Delete all"}) as HTMLButtonElement).disabled).toBe(true);
});
it("shows busy states and prevents repeat submission",()=>{
  state.pending=true;
  render(<NotificationBulkActions hasNotifications hasUnread/>);
  for(const name of ["Deleting…","Marking read…"]){
    const button=screen.getByRole("button",{name}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);expect(button.getAttribute("aria-busy")).toBe("true");
  }
});
it("retains the destructive confirmation and cancels on decline",()=>{
  const confirm=vi.spyOn(window,"confirm").mockReturnValue(false);
  render(<NotificationBulkActions hasNotifications hasUnread/>);
  const form=screen.getByRole("button",{name:"Delete all"}).closest("form")!;
  expect(fireEvent.submit(form)).toBe(false);
  expect(confirm).toHaveBeenCalledWith("Delete all your notifications? This cannot be undone.");
});
it("keeps named, scoped action forms and full-width mobile touch targets",()=>{
  render(<NotificationBulkActions hasNotifications hasUnread/>);
  expect(screen.getByRole("form",{name:"Mark all notifications as read"})).toBeTruthy();expect(screen.getByRole("form",{name:"Delete all notifications"})).toBeTruthy();
  for(const name of ["Mark all read","Delete all"]){const button=screen.getByRole("button",{name});expect(button.classList.contains("min-h-11")).toBe(true);expect(button.classList.contains("w-full")).toBe(true);expect(button.getAttribute("type")).toBe("submit");}
});
it("preserves the bulk actions without adding filter values to their form data",()=>{
  render(<NotificationBulkActions hasNotifications hasUnread/>);for(const form of screen.getAllByRole("form"))expect([...new FormData(form as HTMLFormElement)]).toEqual([]);
  expect(deleteAllNotifications).not.toHaveBeenCalled();expect(markNotificationsRead).not.toHaveBeenCalled();
});
it("keeps bulk mutation controls disabled if included in an audited preview",()=>{
  render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"engineer",displayName:"Engineer",disciplines:[],expiresAt:"2099-01-01"}}><NotificationBulkActions hasNotifications hasUnread/></AdminPreviewBoundary>);
  for(const name of ["Mark all read","Delete all"])expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
});
