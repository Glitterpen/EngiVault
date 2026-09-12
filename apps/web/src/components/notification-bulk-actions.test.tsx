import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NotificationBulkActions} from "./notification-bulk-actions";
const state=vi.hoisted(()=>({pending:false}));
vi.mock("react-dom",async(importOriginal)=>({...await importOriginal<typeof import("react-dom")>(),useFormStatus:()=>({pending:state.pending})}));
vi.mock("@/app/app/workflow-actions",()=>({deleteAllNotifications:vi.fn(),markNotificationsRead:vi.fn()}));
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
