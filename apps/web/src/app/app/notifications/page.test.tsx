import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import NotificationsPage from "./page";
import {NotificationBulkActions} from "@/components/notification-bulk-actions";

const mocks=vi.hoisted(()=>({from:vi.fn(),preview:false,enrich:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireNotificationUser:async()=>({user:{id:"member"},preview:mocks.preview,supabase:{from:mocks.from}})}));
vi.mock("@/lib/notification-document-context",()=>({loadNotificationDocumentContext:mocks.enrich}));
vi.mock("@/components/notification-bulk-actions",()=>({NotificationBulkActions:vi.fn(()=> <div>Bulk actions</div>)}));
vi.mock("@/components/help-tip",()=>({HelpTip:({children}:{children:React.ReactNode})=><span>{children}</span>}));
const notice={id:"notice",title:"Document accepted",body:"Ready for transmission",created_at:"2026-09-12T12:00:00Z",read_at:null as string|null,kind:"review",href:"/app/org/projects/project/documents/document"};
type Read={columns?:string;options?:unknown;filters:[string,unknown][];orders:string[];range?:[number,number];search?:string;head?:boolean};
let items:typeof notice[],failed:boolean,countFailed:boolean,reads:Read[];
function query(){
  const read:Read={filters:[],orders:[]};reads.push(read);
  const result=()=>{
    let matches=items;
    if(read.filters.some(([key])=>key==="read_at"))matches=matches.filter(item=>!item.read_at);
    if(read.search){const term=read.search.match(/%([^%]*)%/)?.[1]?.toLowerCase()??"";matches=matches.filter(item=>`${item.title} ${item.body} ${item.kind}`.toLowerCase().includes(term));}
    return {data:read.head?null:read.range?matches.slice(read.range[0],read.range[1]+1):matches,count:matches.length,error:failed||countFailed&&read.head?{message:"private backend diagnostic"}:null};
  };
  const chain={select:(columns:string,options?:{head?:boolean})=>{read.columns=columns;read.options=options;read.head=options?.head;return chain;},eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},is:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},order:(column:string)=>{read.orders.push(column);return chain;},range:(start:number,end:number)=>{read.range=[start,end];return chain;},limit:()=>chain,or:(value:string)=>{read.search=value;return chain;},then:(resolve:(value:ReturnType<typeof result>)=>unknown,reject?:(error:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
  return chain;
}
beforeEach(()=>{vi.clearAllMocks();items=[notice];failed=false;countFailed=false;reads=[];mocks.preview=false;mocks.from.mockImplementation(query);mocks.enrich.mockResolvedValue(new Map());});
afterEach(cleanup);
const page=(query:Record<string,string>={})=>NotificationsPage({searchParams:Promise.resolve(query)});

it("shows retry instead of an empty inbox when rows or full-inbox counts cannot be read",async()=>{
  for(const counts of [false,true]){
    failed=!counts;countFailed=counts;render(await page({q:"Cable",page:"2"}));
    expect(screen.getByRole("alert").textContent).toContain("Notifications could not be loaded");
    expect(screen.getByRole("link",{name:"Retry notifications"}).getAttribute("href")).toBe("/app/notifications?q=Cable&page=2");
    expect(screen.queryByText("You have no notifications.")).toBeNull();expect(screen.queryByText("Bulk actions")).toBeNull();
    expect(document.body.textContent).not.toContain("private backend diagnostic");cleanup();
  }
});
it("shows a genuine empty inbox only after exact successful reads",async()=>{
  items=[];render(await page());expect(screen.getByText("You have no notifications.")).toBeTruthy();
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:false,hasUnread:false});
});
it("retains recipient scope, stable newest-first order and bounded GET pages",async()=>{
  render(await page());
  for(const read of reads)expect(read.filters).toContainEqual(["recipient_user_id","member"]);
  expect(reads[0]).toMatchObject({columns:"id,kind,title,body,read_at,created_at,href",options:{count:"exact"},orders:["created_at","id"],range:[0,24]});
  expect(screen.getByRole("link",{name:/Document accepted/}).getAttribute("href")).toBe("/app/notifications/notice");
  expect(screen.getByText("12 Sept 2026, 12:00 UTC")).toBeTruthy();expect(screen.getByRole("form",{name:"Search notification history"}).getAttribute("method")).toBe("get");
});
it("searches older messages beyond the previous hundred-message limit",async()=>{
  items=Array.from({length:140},(_,index)=>({...notice,id:`notice-${index}`,title:index===139?"Older cable record":`Message ${index}`}));
  render(await page({q:"Older cable"}));expect(screen.getByRole("link",{name:/Older cable record/}).getAttribute("href")).toBe("/app/notifications/notice-139");
  expect(screen.getByText("140 messages · 140 unread")).toBeTruthy();expect(screen.getByRole("status").textContent).toContain("1 matching notifications");
  expect(reads[0].search).toBe("title.ilike.%Older cable%,body.ilike.%Older cable%,kind.ilike.%Older cable%");
});
it("preserves unread search state on later pages without changing bulk-action scope",async()=>{
  items=Array.from({length:65},(_,index)=>({...notice,id:`notice-${index}`}));
  render(await page({q:"transmission",unread:"1",page:"2"}));
  expect(screen.getByRole("status").textContent).toContain("Showing 26–50 of 65");
  expect(screen.getByRole("link",{name:"Next notifications page"}).getAttribute("href")).toBe("/app/notifications?q=transmission&unread=1&page=3");
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:true,hasUnread:true});
  expect(document.body.textContent).toContain("entire notification inbox, not only the current search or page");
});
it("keeps read-only preview search and navigation available without bulk writes",async()=>{
  mocks.preview=true;render(await page());expect(NotificationBulkActions).not.toHaveBeenCalled();
  expect(screen.getByRole("form",{name:"Search notification history"}).hasAttribute("data-preview-safe")).toBe(true);
});
it("retains authorised document context for visible rows only",async()=>{
  mocks.enrich.mockResolvedValue(new Map([["notice",{number:"DOC-100",title:"MTO list",discipline:"Mechanical"}]]));
  render(await page());expect(mocks.enrich.mock.calls[0][1]).toEqual([notice]);expect(screen.getByText("DOC-100 · Mechanical")).toBeTruthy();
  expect(screen.getByText("MTO list")).toBeTruthy();
});
it("keeps the authorised inbox visible when optional document enrichment throws",async()=>{
  mocks.enrich.mockRejectedValue(new Error("private document lookup failure"));
  render(await page());expect(screen.getByRole("link",{name:/Document accepted/})).toBeTruthy();
  expect(screen.queryByText("Notifications could not be loaded")).toBeNull();expect(document.body.textContent).not.toContain("private document lookup failure");
  expect(vi.mocked(NotificationBulkActions).mock.calls[0][0]).toEqual({hasNotifications:true,hasUnread:true});
});
it("keeps failed deletion visible without claiming search limits its effect",async()=>{
  render(await page({error:"delete_all"}));expect(screen.getByRole("alert").textContent).toContain("Notifications could not be deleted");
  expect(document.body.textContent).toContain("entire notification inbox");
});
