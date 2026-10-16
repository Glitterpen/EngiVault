import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {NotificationInbox,type NotificationInboxItem} from "./notification-inbox";
import {AdminPreviewBoundary} from "./admin-preview-boundary";

vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
afterEach(cleanup);
const items:NotificationInboxItem[]=[
  {id:"newest",kind:"revision_submitted",title:"Revision submitted",body:"Electrical deliverable ready for review",read_at:null,created_at:"2026-10-17T12:00:00Z",receivedLabel:"17 Oct 2026, 12:00 UTC",document:{number:"ENG-ELE-100",title:"Power distribution schedule",discipline:"Electrical"}},
  {id:"middle",kind:"review",title:"Revision accepted",body:"Process design accepted by Document Control",read_at:"2026-10-16T09:00:00Z",created_at:"2026-10-16T08:00:00Z",receivedLabel:"16 Oct 2026, 08:00 UTC",document:null},
  {id:"oldest",kind:"team",title:"Project team updated",body:"Mechanical team appointment",read_at:null,created_at:"2026-10-15T08:00:00Z",receivedLabel:"15 Oct 2026, 08:00 UTC",document:null},
];

describe("clean notification inbox",()=>{
  it("keeps the supplied newest-first order and safe internal message destinations",()=>{
    render(<NotificationInbox items={items}/>);
    const links=within(screen.getByRole("list",{name:"Notifications"})).getAllByRole("link");
    expect(links.map(link=>link.getAttribute("href"))).toEqual(["/app/notifications/newest","/app/notifications/middle","/app/notifications/oldest"]);
    expect(screen.getByText("3 latest · 2 unread")).toBeTruthy();expect(screen.getAllByText("Unread",{selector:"span"})).toHaveLength(2);
    expect(links.every(link=>!link.className.includes("border-l-4"))).toBe(true);
    const time=screen.getByText("17 Oct 2026, 12:00 UTC");expect(time.tagName).toBe("TIME");expect(time.getAttribute("dateTime")).toBe(items[0].created_at);
    expect(screen.getByText(items[0].body).classList.contains("line-clamp-2")).toBe(true);
  });
  it.each(["power distribution","ENG-ELE-100","ELECTRICAL","ready for review"])("searches message and authorised document context locally: %s",search=>{
    render(<NotificationInbox items={items}/>);fireEvent.change(screen.getByRole("searchbox",{name:"Search notifications"}),{target:{value:search}});
    expect(within(screen.getByRole("list",{name:"Notifications"})).getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link",{name:/Revision submitted/}).getAttribute("href")).toBe("/app/notifications/newest");expect(screen.getByRole("status").textContent).toBe("1 of 3 loaded messages");
  });
  it("combines unread state with search without changing the supplied record order",()=>{
    render(<NotificationInbox items={items}/>);const unread=screen.getByRole("button",{name:"Unread 2"});fireEvent.click(unread);expect(unread.getAttribute("aria-pressed")).toBe("true");
    expect(within(screen.getByRole("list",{name:"Notifications"})).getAllByRole("link").map(link=>link.getAttribute("href"))).toEqual(["/app/notifications/newest","/app/notifications/oldest"]);
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"Process"}});expect(screen.getByText("No notifications match your filters.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Show all loaded messages"}));expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("button",{name:"All 3"}).getAttribute("aria-pressed")).toBe("true");expect(screen.getByRole("status").textContent).toBe("3 of 3 loaded messages");
  });
  it("limits the unread empty claim to the loaded messages rather than the entire inbox",()=>{
    render(<NotificationInbox items={[items[1]]}/>);fireEvent.click(screen.getByRole("button",{name:"Unread 0"}));
    expect(screen.getByText("No unread notifications in the latest messages.")).toBeTruthy();expect(screen.queryByText("You have no notifications.")).toBeNull();
  });
  it("renders an honest empty state without redundant search or filters",()=>{
    render(<NotificationInbox items={[]}/>);expect(screen.getByText("You have no notifications.")).toBeTruthy();expect(screen.queryByRole("searchbox")).toBeNull();expect(screen.queryByRole("group",{name:"Filter notifications"})).toBeNull();
  });
  it("keeps very long customer text wrappable and readable without new per-card emphasis",()=>{
    const title="LongDocumentNumber".repeat(20);render(<NotificationInbox items={[{...items[0],title}]}/>);
    expect(screen.getByRole("heading",{name:title}).classList.contains("[overflow-wrap:anywhere]")).toBe(true);expect(screen.getByText("ENG-ELE-100 · Electrical")).toBeTruthy();
    for(const name of ["All 1","Unread 1"])expect(screen.getByRole("button",{name}).classList.contains("min-h-11")).toBe(true);
  });
  it("keeps search and unread browsing usable in audited read-only preview without write controls",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"engineer",displayName:"Engineer",disciplines:["Electrical"],expiresAt:"2099-01-01"}}><NotificationInbox items={items}/></AdminPreviewBoundary>);
    expect((screen.getByRole("searchbox") as HTMLInputElement).disabled).toBe(false);const unread=screen.getByRole("button",{name:"Unread 2"});expect((unread as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(unread);expect(within(screen.getByRole("region",{name:"Your inbox"})).getByRole("status").textContent).toBe("2 of 3 loaded messages");expect(within(screen.getByRole("region",{name:"Your inbox"})).queryByRole("form")).toBeNull();
  });
});
