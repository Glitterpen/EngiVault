import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import ReportsPage from "./page";
const mocks=vi.hoisted(()=>({requireProject:vi.fn(),from:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:mocks.requireProject}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/project-report-controls",()=>({ProjectReportControls:()=><div data-testid="report-controls"/>}));
type Report={id:string;report_number:number;period_start:string;period_end:string;generation_source:string;generated_at:string;snapshot:unknown};
type Read={table:string;selection?:string;filters:[string,unknown][];range?:[number,number];ids?:string[]};
let rows:Report[],reads:Read[],failure:string,role:string;
function query(table:string){
  const read:Read={table,filters:[]};reads.push(read);
  const result=()=>{
    const list=read.ids?rows.filter(row=>read.ids!.includes(row.id)):read.range?rows.slice(read.range[0],read.range[1]+1):rows;
    const data=table==="projects"?{code:"P-001",name:"Engineering project",delivery_stage:"feed"}:table==="project_report_settings"?null:list;
    return {data,count:rows.length,error:failure==="settings"&&table==="project_report_settings"||failure==="index"&&Boolean(read.range)||failure==="snapshot"&&Boolean(read.ids)?{code:"private",message:"provider private diagnostic"}:null};
  };
  const chain={select:(selection:string)=>{read.selection=selection;return chain;},eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},order:()=>chain,range:(start:number,end:number)=>{read.range=[start,end];return chain;},in:(_column:string,ids:string[])=>{read.ids=ids;return chain;},single:async()=>result(),maybeSingle:async()=>result(),then:(resolve:(value:ReturnType<typeof result>)=>unknown,reject?:(error:unknown)=>unknown)=>Promise.resolve(result()).then(resolve,reject)};
  return chain;
}
beforeEach(()=>{
  vi.clearAllMocks();failure="";role="project_admin";reads=[];
  rows=Array.from({length:56},(_,index)=>({id:`report-${56-index}`,report_number:56-index,period_start:"2026-10-01",period_end:"2026-10-07",generation_source:"manual",generated_at:"2026-10-08T06:00:00Z",snapshot:{summary:{overall_progress:75,overdue_deliverables:2}}}));
  mocks.from.mockImplementation(query);mocks.requireProject.mockImplementation(async()=>({supabase:{from:mocks.from},access:{role}}));
});
afterEach(cleanup);
const page=(search:Record<string,string>={})=>ReportsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve(search)});
it("loads a bounded page of report snapshots after a verified lightweight index",async()=>{
  render(await page({page:"3"}));
  expect(screen.getAllByRole("link").filter(link=>link.getAttribute("href")?.includes("/reports/report-"))).toHaveLength(6);
  expect(screen.getByRole("status").textContent).toContain("Showing 51–56 of 56");
  const index=reads.find(read=>read.range),snapshots=reads.find(read=>read.ids);
  expect(index?.selection).not.toContain("snapshot");expect(index?.range).toEqual([0,499]);
  expect(snapshots?.ids).toEqual(rows.slice(50).map(row=>row.id));
  for(const read of reads)expect(read.filters).toEqual([["organisation_id","org"],[tableId(read.table),read.table==="projects"?"project":"project"]]);
  expect(screen.getByRole("link",{name:"Previous reports page"}).getAttribute("href")).toBe("/app/org/projects/project/reports?page=2");
});
function tableId(table:string){return table==="projects"?"id":"project_id";}
it("searches the complete report register by controlled number and dates",async()=>{
  render(await page({q:"PCR-0001"}));expect(screen.getByRole("link",{name:/PCR-0001/})).toBeTruthy();
  expect(reads.find(read=>read.ids)?.ids).toEqual(["report-1"]);expect(screen.getByRole("status").textContent).toContain("1 matching reports");
  const form=screen.getByRole("form",{name:"Search project reports"});expect(form.getAttribute("method")).toBe("get");expect(form.hasAttribute("data-preview-safe")).toBe(true);
});
it.each(["index","snapshot","settings"])("shows unavailable rather than a false zero or paused schedule after %s failure",async value=>{
  failure=value;render(await page({q:"PCR",page:"2"}));
  expect(screen.getByRole("alert")).toBeTruthy();expect(screen.getByRole("link",{name:"Retry loading"}).getAttribute("href")).toBe("/app/org/projects/project/reports?q=PCR&page=2");
  expect(screen.queryByText("No project report yet")).toBeNull();expect(screen.queryByTestId("report-controls")).toBeNull();expect(document.body.textContent).not.toMatch(/private|provider/);
});
it("does not fabricate zero metrics when a historical snapshot lacks its summary",async()=>{
  rows=[{...rows[0],snapshot:{}}];render(await page());expect(screen.getAllByText("Not available")).toHaveLength(2);expect(screen.queryByText("0%")).toBeNull();
});
it("retains report-generation role gates and compact closed settings",async()=>{
  role="document_controller";render(await page());expect(screen.queryByTestId("report-controls")).toBeNull();
  cleanup();role="project_admin";render(await page());expect(screen.getByText("Report settings & generation",{selector:"summary"}).closest("details")?.open).toBe(false);
});
