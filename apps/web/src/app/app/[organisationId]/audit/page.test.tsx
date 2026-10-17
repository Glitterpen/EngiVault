import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import AuditPage from "./page";
const mocks=vi.hoisted(()=>({requireUser:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:mocks.requireUser}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NOT_FOUND");}}));
type Event={id:string;created_at:string;action:string;outcome:string;target_type:string;actor_user_id:string};
type Read={filters:[string,unknown][];range?:[number,number];search?:string};
let rows:Event[],reads:Read[],failed:boolean,admin:boolean;
function query(){
  const read:Read={filters:[]};reads.push(read);
  const result=()=>{
    let matches=rows;const action=read.filters.find(([column])=>column==="action")?.[1];
    if(action)matches=matches.filter(row=>row.action===action);
    if(read.search){const term=read.search.match(/%([^%]*)%/)?.[1]??"";matches=matches.filter(row=>`${row.action} ${row.outcome} ${row.target_type}`.includes(term));}
    return {data:read.range?matches.slice(read.range[0],read.range[1]+1):matches,count:matches.length,error:failed?{message:"private provider diagnostic"}:null};
  };
  const chain={select:()=>chain,eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},order:()=>chain,range:(start:number,end:number)=>{read.range=[start,end];return chain;},or:(value:string)=>{read.search=value;return chain;},then:(resolve:(value:ReturnType<typeof result>)=>unknown,reject?:(error:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
  return chain;
}
beforeEach(()=>{
  vi.clearAllMocks();reads=[];failed=false;admin=true;
  rows=Array.from({length:230},(_,index)=>({id:`event-${index}`,created_at:"2026-10-01T12:00:00Z",action:"revision.accepted",outcome:index===225?"denied":"succeeded",target_type:"revision",actor_user_id:"engineer"}));
  mocks.from.mockImplementation(query);mocks.rpc.mockImplementation(async()=>({data:[{organisation_id:"org",role:admin?"organisation_admin":"member"}],error:null}));mocks.requireUser.mockResolvedValue({supabase:{from:mocks.from,rpc:mocks.rpc}});
});
afterEach(cleanup);
const page=(query:Record<string,string>={})=>AuditPage({params:Promise.resolve({organisationId:"org"}),searchParams:Promise.resolve(query)});
it("browses beyond the old 200-event limit with scoped stable GET pagination",async()=>{
  render(await page({page:"9"}));expect(screen.getByRole("status").textContent).toContain("Showing 201–225 of 230");
  expect(reads[0]).toMatchObject({filters:[["organisation_id","org"]],range:[200,224]});
  expect(screen.getByRole("link",{name:"Next audit events page"}).getAttribute("href")).toBe("/app/org/audit?page=10");
  expect(screen.getByRole("form",{name:"Search audit history"}).getAttribute("method")).toBe("get");
});
it("searches older events and retains exact action filtering",async()=>{
  render(await page({q:"denied",action:"revision.accepted"}));expect(screen.getByRole("cell",{name:"denied"})).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("1 matching audit events");expect(reads[0].filters).toContainEqual(["action","revision.accepted"]);
  expect(reads[0].search).toBe("action.ilike.%denied%,target_type.ilike.%denied%,outcome.ilike.%denied%");
});
it("retains admin-only access before any audit read",async()=>{
  admin=false;await expect(page()).rejects.toThrow("NOT_FOUND");expect(mocks.from).not.toHaveBeenCalled();
});
it("preserves filters and page on read failure without claiming an empty history",async()=>{
  failed=true;render(await page({q:"denied",action:"revision.accepted",page:"3"}));expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry loading"}).getAttribute("href")).toBe("/app/org/audit?action=revision.accepted&q=denied&page=3");expect(document.body.textContent).not.toMatch(/private|No audit events/);
});
