import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import LibraryPage from "./page";
import RevisionPage from "./[revisionId]/page";
import {requireProject} from "@/lib/auth";
import type {InterdisciplinaryStageLibrary} from "@/lib/interdisciplinary-stage-library";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/app/app/interdisciplinary-actions",()=>({recordInterdisciplinaryCheck:vi.fn(),recordInterdisciplinaryComment:vi.fn()}));
const {uiExport}=vi.hoisted(()=>({uiExport:{enabled:false}}));
vi.mock("@/components/interdisciplinary-ask",async()=>{
  const actual=await vi.importActual<typeof import("@/components/interdisciplinary-ask")>("@/components/interdisciplinary-ask");
  return {InterdisciplinaryAsk:(props:Parameters<typeof actual.InterdisciplinaryAsk>[0])=>uiExport.enabled?<actual.InterdisciplinaryAsk {...props}/>:<section aria-label="Ask approved deliverables" data-discipline={props.discipline} data-can-ask={String(props.canAsk)} data-preview={String(props.preview)}/>};
});
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found")}}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001",revisionId="c0000000-0000-4000-8000-000000000001";
const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
const rpc=vi.fn();let preview:unknown,role:string;
const detail=()=>({documentId:"doc",documentNumber:"MEC-001",title:"Mechanical layout",discipline:"Mechanical",documentType:"Drawing",revisionId,revisionCode:"B",issueStatus:"IFA",issueDate:"2026-09-01",approvedAt:"2026-09-02",filename:"layout.pdf",hasNative:true,isCurrent:true,canSignOff:true,checks:[]});
const documentRow=(overrides:Record<string,unknown>={})=>({document_id:"doc",document_number:"MEC-001",title:"Mechanical layout",discipline:"Mechanical",document_type:"Drawing",revision_id:revisionId,revision_code:"B",issue_status:"IFA",issue_date:"2026-09-01",...overrides});
const stageRow=(code:string,documents:ReturnType<typeof documentRow>[]=[],overrides:Record<string,unknown>={})=>({code,label:({IFR:"Issued for Review (IFR)",IFA:"Issued for Approval (IFA)",IFD:"Issued for Design (IFD)",IFC:"Issued for Construction (IFC)"} as Record<string,string>)[code]??code,total:documents.length,revisionTotal:documents.length,matchTotal:documents.length,matchRevisionTotal:documents.length,page:1,pageSize:25,documents,...overrides});
function libraryData(stages=[stageRow("IFR"),stageRow("IFA",[documentRow()]),stageRow("IFD"),stageRow("IFC")],overrides:Record<string,unknown>={}):InterdisciplinaryStageLibrary{
  const counts={total:stages.reduce((sum,stage)=>sum+stage.total,0),revisionTotal:stages.reduce((sum,stage)=>sum+stage.revisionTotal,0),matchTotal:stages.reduce((sum,stage)=>sum+stage.matchTotal,0),matchRevisionTotal:stages.reduce((sum,stage)=>sum+stage.matchRevisionTotal,0)};
  return {projectActive:true,...counts,disciplines:[{discipline:"Mechanical",...counts,stages}],stages,...overrides} as InterdisciplinaryStageLibrary;
}
const libraryPage=(search:Record<string,string|string[]|undefined>={})=>LibraryPage({params:Promise.resolve({organisationId,projectId}),searchParams:Promise.resolve(search)});
const revisionPage=(search:{q?:string;page?:string;discipline?:string}={})=>RevisionPage({params:Promise.resolve({organisationId,projectId,revisionId}),searchParams:Promise.resolve(search)});
const linkUrl=(link:HTMLElement)=>new URL(link.getAttribute("href")!,"https://app.engicite.com");
beforeEach(()=>{vi.clearAllMocks();preview=null;role="engineer";vi.mocked(requireProject).mockImplementation(async()=>({supabase:{rpc},access:{role},preview} as never));rpc.mockResolvedValue({data:detail(),error:null});});
afterEach(cleanup);

it("shows every discipline folder with full approved counts rather than a global document page",async()=>{
  const data=libraryData();data.disciplines=["Process","Mechanical","Electrical"].map(discipline=>({...data.disciplines[0],discipline,total:72,revisionTotal:113}));
  rpc.mockResolvedValue({data,error:null});render(await libraryPage({q:"layout & list",page:"3"}));
  expect(screen.getByRole("heading",{level:1,name:"Interdisciplinary check"})).toBeTruthy();expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  const folders=screen.getAllByRole("link").filter(link=>linkUrl(link).pathname===base&&linkUrl(link).searchParams.get("discipline"));
  expect(folders.map(link=>linkUrl(link).searchParams.get("discipline"))).toEqual(["Electrical","Mechanical","Process"]);
  for(const folder of folders){expect(linkUrl(folder).searchParams.get("q")).toBe("layout & list");expect(linkUrl(folder).searchParams.has("page_IFR")).toBe(false);expect(folder.textContent).toContain("72 approved deliverables · 113 revisions");}
  expect(document.querySelectorAll("article,details")).toHaveLength(0);expect(screen.queryByRole("link",{name:/View approved file/})).toBeNull();
  expect(rpc).toHaveBeenCalledWith("get_interdisciplinary_stage_library",expect.objectContaining({filter_discipline:"",stage_pages:{IFR:3,IFA:3,IFD:3,IFC:3}}));
});
it("shows an honest empty overview when the project has no approved disciplines",async()=>{
  rpc.mockResolvedValue({data:libraryData([],{disciplines:[]}),error:null});render(await libraryPage());
  expect(screen.getByText(/Discipline folders will appear when documents are approved/)).toBeTruthy();expect(screen.queryByRole("navigation",{name:/revision pages/})).toBeNull();
});
it("keeps each issue-stage page independent and preserves the search and other stage pages",async()=>{
  const data=libraryData([stageRow("IFR",[documentRow({issue_status:"IFR"})],{total:76,revisionTotal:80,matchTotal:61,matchRevisionTotal:66,page:2}),stageRow("IFA",[documentRow({revision_id:"approval"})],{total:40,revisionTotal:50,matchTotal:40,matchRevisionTotal:50,page:1}),stageRow("IFD"),stageRow("IFC")]);
  rpc.mockResolvedValue({data,error:null});render(await libraryPage({q:"MEC & layout",discipline:"Mechanical",page:"2",page_IFA:"1"}));
  expect(screen.getByRole("button",{name:"Search library"}).closest("form")?.method).toBe("get");
  expect(rpc).toHaveBeenCalledWith("get_interdisciplinary_stage_library",expect.objectContaining({search_text:"MEC & layout",filter_discipline:"Mechanical",stage_pages:{IFR:2,IFA:1,IFD:2,IFC:2}}));
  const nav=screen.getByRole("navigation",{name:"Issued for Review (IFR) revision pages"});
  const next=linkUrl(within(nav).getByRole("link",{name:/Next IFR/})),previous=linkUrl(within(nav).getByRole("link",{name:/Previous IFR/}));
  expect(next.searchParams.get("q")).toBe("MEC & layout");expect(next.searchParams.get("discipline")).toBe("Mechanical");expect(next.searchParams.get("page_IFR")).toBe("3");expect(next.searchParams.has("page_IFA")).toBe(false);expect(previous.searchParams.has("page_IFR")).toBe(false);expect(next.searchParams.get("stage")).toBe("IFR");expect(next.hash).toBe("#stage-IFR");
  expect(nav.textContent).toContain("Showing 26–50 of 66 matching revisions · Page 2 of 3");
  expect(screen.getByRole("heading",{level:3,name:/Issued for Review.*76 approved deliverables/})).toBeTruthy();
  const file=linkUrl(screen.getAllByRole("link",{name:/View approved file.*revision B/})[0]);expect(file.pathname).toBe(`${base}/${revisionId}`);expect(file.searchParams.get("page")).toBe("2");
});
it("retains IFR, IFA, IFD and IFC including empty stages, with the first non-empty stage expanded",async()=>{
  rpc.mockResolvedValue({data:libraryData(),error:null});render(await libraryPage({discipline:"Mechanical"}));
  const groups=Array.from(document.querySelectorAll('details[id^="stage-"]'));expect(groups).toHaveLength(4);
  expect(groups.map(group=>group.querySelector("h3")?.textContent)).toEqual(["Issued for Review (IFR) 0 approved deliverables","Issued for Approval (IFA) 1 approved deliverable","Issued for Design (IFD) 0 approved deliverables","Issued for Construction (IFC) 0 approved deliverables"]);
  expect(groups.map(group=>group.hasAttribute("open"))).toEqual([false,true,false,false]);expect(document.querySelectorAll('nav[aria-label="Approved issue stages"] a')).toHaveLength(4);
});
it("renders historical approvals for the same deliverable at every stage rather than only its latest issue",async()=>{
  const stages=[stageRow("IFR",[documentRow({revision_id:"review-old",revision_code:"R01",issue_status:"IFR"})]),stageRow("IFA",[documentRow({revision_id:"approval-old",revision_code:"A01"})]),stageRow("IFD",[documentRow({revision_id:"design-new",revision_code:"D01",issue_status:"IFD"})]),stageRow("IFC")];
  rpc.mockResolvedValue({data:libraryData(stages,{total:1,revisionTotal:3}),error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(document.querySelectorAll("article")).toHaveLength(3);for(const id of ["review-old","approval-old","design-new"])expect(document.querySelector(`a[href*="/${id}?"]`)).toBeTruthy();expect(screen.getByText("1 approved deliverable · 3 revisions")).toBeTruthy();
});
it("preserves newest-first order inside each stage and retains approved custom purposes",async()=>{
  const stages=[stageRow("IFR",[documentRow({revision_id:"new",title:"Newest review",submitted_at:"2026-10-04T09:00:00Z"}),documentRow({revision_id:"old",title:"Older review",submitted_at:"2026-09-04T09:00:00Z"})]),stageRow("IFA"),stageRow("IFD"),stageRow("IFC"),stageRow("purpose:coordination issue",[documentRow({revision_id:"custom",title:"Coordination reference"})],{label:"Coordination Issue"})];
  rpc.mockResolvedValue({data:libraryData(stages),error:null});render(await libraryPage({discipline:"Mechanical"}));
  const groups=Array.from(document.querySelectorAll('details[id^="stage-"]'));expect(Array.from(groups[0].querySelectorAll("h4")).map(node=>node.textContent)).toEqual(["Newest review","Older review"]);expect(groups[4].querySelector("h3")?.textContent).toContain("Coordination Issue");
});
it("keeps the requested stage expanded after following its independent page link",async()=>{
  const stages=[stageRow("IFR",[documentRow({revision_id:"review"})]),stageRow("IFA",[documentRow({revision_id:"approval",revision_code:"A02"})],{page:2,total:60,revisionTotal:60,matchTotal:60,matchRevisionTotal:60}),stageRow("IFD"),stageRow("IFC")];
  rpc.mockResolvedValue({data:libraryData(stages),error:null});render(await libraryPage({discipline:"Mechanical",page_IFA:"2",stage:"IFA"}));
  expect(document.getElementById("stage-IFR")?.hasAttribute("open")).toBe(false);expect(document.getElementById("stage-IFA")?.hasAttribute("open")).toBe(true);
  const next=linkUrl(within(screen.getByRole("navigation",{name:"Issued for Approval (IFA) revision pages"})).getByRole("link",{name:/Next IFA/}));expect(next.searchParams.get("stage")).toBe("IFA");expect(next.searchParams.get("page_IFA")).toBe("3");expect(next.hash).toBe("#stage-IFA");
});
it("ignores unknown requested stages and creates working custom-purpose anchors",async()=>{
  const code="purpose:coordination / café";rpc.mockResolvedValue({data:libraryData([stageRow("IFR",[documentRow()]),stageRow(code,[documentRow({revision_id:"custom"})],{label:"Coordination / café",revisionTotal:30,matchRevisionTotal:30})]),error:null});render(await libraryPage({discipline:"Mechanical",stage:"forged stage"}));
  expect(document.getElementById("stage-IFR")?.hasAttribute("open")).toBe(true);
  const groups=Array.from(document.querySelectorAll('details[id^="stage-"]')),custom=groups[1];expect(custom.id).not.toContain("%");expect(decodeURIComponent(custom.id)).toBe(custom.id);
  const link=Array.from(document.querySelectorAll('nav[aria-label="Approved issue stages"] a')).find(link=>link.textContent?.includes("Coordination / café")) as HTMLElement;
  const url=linkUrl(link);expect(url.hash).toBe(`#${custom.id}`);expect(url.searchParams.get("stage")).toBe(code);
});
it("posts comments against the exact approved historical revision rather than the latest document revision",async()=>{
  rpc.mockResolvedValue({data:libraryData([stageRow("IFR",[documentRow({revision_id:"historic-ifr",revision_code:"R01"})]),stageRow("IFA",[documentRow({revision_id:"historic-ifa",revision_code:"A01"})]),stageRow("IFD",[documentRow({revision_id:"accepted-ifd",revision_code:"D01"})])]),error:null});render(await libraryPage({discipline:"Mechanical"}));
  const forms=Array.from(document.querySelectorAll('form[aria-label="Add interdisciplinary comment or query"]'));
  expect(forms.map(form=>(form.querySelector('input[name="revisionId"]') as HTMLInputElement).value)).toEqual(["historic-ifr","historic-ifa","accepted-ifd"]);
  for(const form of forms){expect((form.querySelector('input[name="organisationId"]') as HTMLInputElement).value).toBe(organisationId);expect((form.querySelector('input[name="projectId"]') as HTMLInputElement).value).toBe(projectId);expect(form.closest("article")).toBeTruthy();expect(form.closest("details")?.querySelector("summary")?.textContent).toBe("Add comment or query");}
  expect(screen.queryByRole("button",{name:"Approve submission"})).toBeNull();expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();
});
it.each([["engineer",false,true],["document_controller",false,true],["project_admin",false,true],["organisation_admin",false,false],["viewer",false,false],["engineer",true,false],["document_controller",true,false]])("keeps inline comment eligibility scoped for role %s preview=%s",async(userRole,inPreview,allowed)=>{
  role=userRole;preview=inPreview?{}:null;rpc.mockResolvedValue({data:libraryData(),error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(document.querySelectorAll('form[aria-label="Add interdisciplinary comment or query"]').length).toBe(allowed?1:0);expect(document.querySelector('input[type="file"]')).toBeNull();
});
it.each([false,undefined])("keeps approved reference reads available but disables AI and comments for projectActive=%s",async(projectActive)=>{
  rpc.mockResolvedValue({data:libraryData(undefined,{projectActive}),error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(screen.getByRole("region",{name:"Ask approved deliverables"}).getAttribute("data-can-ask")).toBe("false");
  expect(document.querySelectorAll('form[aria-label="Add interdisciplinary comment or query"]')).toHaveLength(0);
  expect(screen.getByRole("heading",{level:2,name:/Mechanical folder/})).toBeTruthy();expect(screen.getByRole("link",{name:/View approved file and checks/})).toBeTruthy();
});
it("labels submitted dates and uses the issue date only for a legacy missing submission date",async()=>{
  rpc.mockResolvedValue({data:libraryData([stageRow("IFR",[documentRow({revision_id:"new",title:"Recent upload",submitted_at:"2026-10-04T09:00:00Z",issue_date:"2026-09-01"}),documentRow({revision_id:"legacy",title:"Earlier record",issue_date:"2026-09-02"})])]),error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(screen.getByRole("heading",{level:4,name:"Recent upload"}).closest("article")?.textContent).toContain("Submitted 04 Oct 2026");expect(screen.getByRole("heading",{level:4,name:"Earlier record"}).closest("article")?.textContent).toContain("Issued 02 Sept 2026");
});
it("distinguishes complete stage totals from zero search matches without hiding the stage directory",async()=>{
  const stage=stageRow("IFR",[],{total:80,revisionTotal:82,matchTotal:0,matchRevisionTotal:0});rpc.mockResolvedValue({data:libraryData([stage]),error:null});render(await libraryPage({q:"does not exist",discipline:"Mechanical"}));
  expect(screen.getByRole("heading",{level:3,name:/80 approved deliverables/})).toBeTruthy();expect(screen.getByText(/0 matching deliverables · 0 matching revisions/)).toBeTruthy();expect(screen.getByText("No approved documents match this selection.")).toBeTruthy();expect(screen.getByRole("link",{name:"Clear search"}).getAttribute("href")).toBe(`${base}?discipline=Mechanical`);
});
it.each([["engineer",false,true],["document_controller",false,true],["project_admin",false,false],["organisation_admin",false,false],["engineer",true,false]])("preserves the AI-use boundary for role %s preview=%s",async(userRole,inPreview,allowed)=>{
  role=userRole;preview=inPreview?{}:null;rpc.mockResolvedValue({data:libraryData(),error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(screen.getByRole("region",{name:"Ask approved deliverables"}).getAttribute("data-can-ask")).toBe(String(allowed));expect(screen.getByRole("region",{name:"Ask approved deliverables"}).getAttribute("data-preview")).toBe(String(inPreview));
});
it.each(["XX000","ADMIN_PREVIEW_READ_ONLY","42501"])("renders a controlled library error for %s without raw diagnostics or false empty states",async(code)=>{
  rpc.mockResolvedValue({data:libraryData(),error:{code,message:"private service diagnostic"}});render(await libraryPage({q:"MEC & layout",discipline:"Mechanical",page_IFR:"2"}));
  expect(screen.getByRole("alert").textContent).toContain("Approved documents could not be verified");expect(screen.queryByText("private service diagnostic")).toBeNull();expect(screen.queryByText("Mechanical layout")).toBeNull();expect(screen.queryByRole("region",{name:"Ask approved deliverables"})).toBeNull();
  expect(screen.queryByText(/No approved documents match|Discipline folders will appear/)).toBeNull();const retry=linkUrl(screen.getByRole("link",{name:"Retry loading"}));expect(retry.searchParams.get("q")).toBe("MEC & layout");expect(retry.searchParams.get("discipline")).toBe("Mechanical");expect(retry.searchParams.get("page_IFR")).toBe("2");expect(rpc).toHaveBeenCalledTimes(1);
});
it.each([null,{}, {total:1,disciplines:["Mechanical"],documents:[]}])("does not treat an invalid or old library response as verified empty data: %s",async(data)=>{
  rpc.mockResolvedValue({data,error:null});render(await libraryPage());expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByText(/Discipline folders will appear/)).toBeNull();
});

// Existing revision-file, DCC/sign-off and read-only preview boundaries remain.
it("provides approved-file and native links without upload or DCC approval controls",async()=>{render(await revisionPage());expect(screen.getByRole("link",{name:/View approved file/}).getAttribute("href")).toContain(`/interdisciplinary/${revisionId}/file`);expect(screen.getByRole("link",{name:"Download native file"})).toBeTruthy();expect(screen.getByRole("button",{name:"Record interdisciplinary check"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Approve submission"})).toBeNull();expect(document.querySelector('input[type="file"]')).toBeNull();});
it("requires feedback when requesting changes",async()=>{render(await revisionPage());fireEvent.change(screen.getByRole("combobox",{name:"Interdisciplinary decision"}),{target:{value:"changes_requested"}});expect((screen.getByRole("textbox",{name:"Required changes"}) as HTMLTextAreaElement).required).toBe(true);expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);});
it("hides sign-off even if the preview response advertises it",async()=>{preview={};render(await revisionPage());expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();expect(screen.getByRole("link",{name:/View approved file/})).toBeTruthy();});
it("explains stale revisions and keeps their history visible",async()=>{rpc.mockResolvedValue({data:{...detail(),isCurrent:false,canSignOff:false,checks:[{id:"check",decision:"changes_requested",comment:"Revise nozzle clearance",reviewer_name:"Process reviewer",reviewer_role:"engineer",reviewer_disciplines:["Process"],created_at:"2026-09-02",is_mine:false,is_latest:true}]},error:null});render(await revisionPage());expect(screen.getByText(/A newer approved revision exists/)).toBeTruthy();expect(screen.getByText("Revise nozzle clearance")).toBeTruthy();expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();});
it("does not display an unavailable or unauthorised revision",async()=>{rpc.mockResolvedValue({data:null,error:{code:"42501"}});await expect(revisionPage()).rejects.toThrow("not found");});
it.each(["library","revision"])("offers a preview-safe exit and GET retry on a failed %s read",async(kind)=>{
  preview={};rpc.mockResolvedValue({data:null,error:{code:"ADMIN_PREVIEW_READ_ONLY",message:"private expired session diagnostic"}});render(await(kind==="library"?libraryPage():revisionPage({q:"MEC & layout",page:"3"})));
  const alert=screen.getByRole("alert");expect(alert.textContent).toContain("If this member preview has expired");expect(alert.textContent).not.toContain("private expired session diagnostic");expect(screen.getByRole("link",{name:"Retry loading"}).hasAttribute("data-preview-safe")).toBe(true);
  const exit=screen.getByRole("button",{name:"Exit preview"}) as HTMLButtonElement;expect(exit.type).toBe("submit");expect(exit.form?.getAttribute("action")).toBe("/api/admin-preview/exit");expect(exit.form?.method).toBe("post");expect(exit.form?.hasAttribute("data-preview-safe")).toBe(true);expect(document.querySelector('input[type="file"]')).toBeNull();expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();expect(rpc).toHaveBeenCalledTimes(1);
});
it("preserves revision retry scope and does not display failed reads as approved history",async()=>{
  rpc.mockResolvedValue({data:detail(),error:{code:"XX000",message:"private service diagnostic"}});render(await revisionPage({q:"MEC & layout",page:"3"}));expect(screen.getByRole("heading",{level:1,name:"Interdisciplinary check could not be loaded"})).toBeTruthy();expect(screen.getByRole("alert").textContent).toContain("No documents or checks have been changed");expect(screen.queryByText("Mechanical layout")).toBeNull();expect(screen.queryByText("DCC approved")).toBeNull();const retry=linkUrl(screen.getByRole("link",{name:"Retry loading"}));expect(retry.pathname).toBe(`${base}/${revisionId}`);expect(retry.searchParams.get("q")).toBe("MEC & layout");expect(retry.searchParams.get("page")).toBe("3");
});
it.each(["library","revision"])("keeps a rejected %s read within the controlled unavailable state",async(kind)=>{rpc.mockRejectedValue(new Error("private transport diagnostic"));render(await(kind==="library"?libraryPage():revisionPage()));expect(screen.getByRole("alert")).toBeTruthy();expect(screen.queryByText("private transport diagnostic")).toBeNull();expect(screen.getByRole("link",{name:"Retry loading"})).toBeTruthy();expect(rpc).toHaveBeenCalledTimes(1);});
it.each([false,true])("retains forbidden-revision not-found behavior in preview=%s",async(inPreview)=>{preview=inPreview?{}:null;rpc.mockResolvedValue({data:null,error:{code:"42501"}});await expect(revisionPage()).rejects.toThrow("not found");});
it("retains not-found behavior for genuinely missing revisions",async()=>{rpc.mockResolvedValue({data:null,error:null});await expect(revisionPage()).rejects.toThrow("not found");});
it.each(["library","revision"])("does not swallow access redirects before a %s read",async(kind)=>{const redirectSignal=Object.assign(new Error("NEXT_REDIRECT"),{digest:"NEXT_REDIRECT;replace;/admin-preview-unavailable;307;"});vi.mocked(requireProject).mockRejectedValue(redirectSignal);await expect(kind==="library"?libraryPage():revisionPage()).rejects.toBe(redirectSignal);expect(rpc).not.toHaveBeenCalled();});
it("returns a document to its actual discipline and issue stage with search and stage page preserved",async()=>{render(await revisionPage({q:"MEC & layout",page:"3",discipline:"Process"}));const back=linkUrl(screen.getByRole("link",{name:/Mechanical.*folder/}));expect(back.pathname).toBe(base);expect(back.searchParams.get("discipline")).toBe("Mechanical");expect(back.searchParams.get("q")).toBe("MEC & layout");expect(back.searchParams.get("page")).toBeNull();expect(back.searchParams.get("stage")).toBe("IFA");expect(back.searchParams.get("page_IFA")).toBe("3");expect(back.hash).toBe("#stage-IFA");});
it("returns directly opened documents to the first page of their actual issue stage",async()=>{render(await revisionPage());const back=linkUrl(screen.getByRole("link",{name:/Mechanical.*folder/}));expect(back.searchParams.get("discipline")).toBe("Mechanical");expect(back.searchParams.get("stage")).toBe("IFA");expect(back.searchParams.get("page_IFA")).toBe("1");expect(back.searchParams.has("page")).toBe(false);});
it.each([["Issued for Design (IFD)","IFD","stage-IFD"],["Coordination / Café","purpose:coordination / café","stage-purpose_3Acoordination_20_2F_20caf_C3_A9"]])("returns %s revisions to their exact stage rather than reopening IFR",async(issueStatus,code,anchor)=>{
  rpc.mockResolvedValue({data:{...detail(),issueStatus},error:null});render(await revisionPage({page:"2",q:"cable"}));const back=linkUrl(screen.getByRole("link",{name:/Mechanical.*folder/}));expect(back.searchParams.get("stage")).toBe(code);expect(back.searchParams.get(`page_${code}`)).toBe("2");expect(back.searchParams.get("page_IFR")).toBeNull();expect(back.searchParams.has("page")).toBe(false);expect(back.hash).toBe(`#${anchor}`);
});

it("exports the actual approved-stage layout for optional desktop and mobile visual checks",async()=>{
  const output=process.env.INTERDISCIPLINARY_UI_PREVIEW_DIR;if(!output)return;
  const rows=Array.from({length:25},(_,index)=>documentRow({document_id:`el-${index}`,revision_id:`el-review-${index}`,document_number:`NWC-CRX-DRG-EL-${String(index+1).padStart(4,"0")}-00`,title:["Electrical single-line diagram","Cable routing and tray arrangement","Electrical equipment layout","Power distribution schedule"][index%4],discipline:"Electrical",revision_code:index===0?"R02":"R01",issue_status:"IFR",submitted_at:`2026-10-${String(18-Math.floor(index/3)).padStart(2,"0")}T09:00:00Z`}));
  const stages=[stageRow("IFR",rows,{total:31,revisionTotal:32,matchTotal:31,matchRevisionTotal:32}),stageRow("IFA",[documentRow({revision_id:"el-approval",document_number:"NWC-CRX-SPC-EL-0002-00",title:"Electrical cable specification",discipline:"Electrical",revision_code:"A01",submitted_at:"2026-10-17T11:00:00Z"})]),stageRow("IFD",[documentRow({revision_id:"el-design",document_number:"NWC-CRX-LST-EL-0001-00",title:"Electrical load list",discipline:"Electrical",revision_code:"D01",issue_status:"IFD",submitted_at:"2026-10-16T09:00:00Z"})]),stageRow("IFC")];
  const data=libraryData(stages,{total:31,revisionTotal:34,matchTotal:31,matchRevisionTotal:34});
  const otherFolder=(discipline:string,total:number,counts:number[])=>({discipline,total,revisionTotal:counts.reduce((sum,count)=>sum+count,0),matchTotal:total,matchRevisionTotal:counts.reduce((sum,count)=>sum+count,0),stages:stages.map((stage,index)=>({...stage,total:counts[index],revisionTotal:counts[index],matchTotal:counts[index],matchRevisionTotal:counts[index]}))});
  data.disciplines=[{...data.disciplines[0],discipline:"Electrical",total:31,revisionTotal:34},otherFolder("Instrumentation",19,[19,13,10,0]),otherFolder("Process",26,[26,20,12,0])];
  rpc.mockImplementation(async(_name:string,args:{filter_discipline:string})=>({data:args.filter_discipline?data:{...data,total:76,revisionTotal:134,matchTotal:76,matchRevisionTotal:134,stages:[]},error:null}));uiExport.enabled=true;
  try{
    const {mkdir,readFile,writeFile}=await import("node:fs/promises"),{createRequire}=await import("node:module"),{dirname,resolve}=await import("node:path"),{renderToString}=await import("react-dom/server");
    const require=createRequire(import.meta.url),pluginPath=require.resolve("@tailwindcss/postcss"),postcss=require(require.resolve("postcss",{paths:[dirname(pluginPath)]}));
    const cssPath=resolve(process.cwd(),"src/app/globals.css"),compiled=await postcss([require(pluginPath)({base:process.cwd()})]).process(await readFile(cssPath,"utf8"),{from:cssPath});
    const wrap=(markup:string)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Interdisciplinary library — local visual check</title><style>${compiled.css}</style></head><body><main class="workspace-main px-4 py-5 sm:p-6"><p class="mb-3 text-xs text-[#617083]">Local preview · synthetic approved-stage history</p>${markup}</main></body></html>`;
    await mkdir(output,{recursive:true});
    await writeFile(resolve(output,"index.html"),wrap(renderToString(await libraryPage({discipline:"Electrical"}))));
    await writeFile(resolve(output,"folders.html"),wrap(renderToString(await libraryPage())));
    expect(data.stages[0].documents.length).toBe(25);expect(data.stages[0].revisionTotal).toBeGreaterThan(25);
  }finally{uiExport.enabled=false;}
},30000);
