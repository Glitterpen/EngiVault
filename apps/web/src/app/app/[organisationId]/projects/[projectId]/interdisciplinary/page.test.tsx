import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import LibraryPage from "./page";
import RevisionPage from "./[revisionId]/page";
import {requireProject} from "@/lib/auth";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/app/app/interdisciplinary-actions",()=>({recordInterdisciplinaryCheck:vi.fn()}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found")}}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001",revisionId="c0000000-0000-4000-8000-000000000001";
const base=`/app/${organisationId}/projects/${projectId}/interdisciplinary`;
const rpc=vi.fn();let preview:unknown;
const detail=()=>({documentId:"doc",documentNumber:"MEC-001",title:"Mechanical layout",discipline:"Mechanical",documentType:"Drawing",revisionId,revisionCode:"B",issueStatus:"IFA",issueDate:"2026-09-01",approvedAt:"2026-09-02",filename:"layout.pdf",hasNative:true,isCurrent:true,canSignOff:true,checks:[]});
const documentRow=(overrides:Record<string,unknown>={})=>({document_id:"doc",document_number:"MEC-001",title:"Mechanical layout",discipline:"Mechanical",document_type:"Drawing",revision_id:revisionId,revision_code:"B",issue_status:"IFA",issue_date:"2026-09-01",...overrides});
const libraryPage=(search:{q?:string;discipline?:string;page?:string}={})=>LibraryPage({params:Promise.resolve({organisationId,projectId}),searchParams:Promise.resolve(search)});
const revisionPage=(search:{q?:string;page?:string;discipline?:string}={})=>RevisionPage({params:Promise.resolve({organisationId,projectId,revisionId}),searchParams:Promise.resolve(search)});
const linkUrl=(link:HTMLElement)=>new URL(link.getAttribute("href")!,"https://app.engicite.com");
beforeEach(()=>{vi.clearAllMocks();preview=null;vi.mocked(requireProject).mockImplementation(async()=>({supabase:{rpc},access:{role:"engineer"},preview} as never));rpc.mockResolvedValue({data:detail(),error:null});});
afterEach(cleanup);
it("shows the complete discipline folder overview rather than a global document page",async()=>{
  rpc.mockResolvedValue({data:{total:72,disciplines:["Process","Mechanical","Electrical"],documents:[documentRow()]},error:null});
  render(await libraryPage({q:"layout & list",page:"3"}));
  expect(screen.getByRole("heading",{level:1,name:"Interdisciplinary check"})).toBeTruthy();
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  expect(screen.getByText("Project reference library").className).not.toContain("uppercase");
  const folders=screen.getAllByRole("link").filter(link=>linkUrl(link).pathname===base&&linkUrl(link).searchParams.get("discipline"));
  expect(folders.map(link=>linkUrl(link).searchParams.get("discipline"))).toEqual(["Electrical","Mechanical","Process"]);
  for(const folder of folders){expect(linkUrl(folder).searchParams.get("q")).toBe("layout & list");expect(linkUrl(folder).searchParams.get("page")??"1").toBe("1");}
  expect(new Set(folders.map(folder=>folder.getAttribute("href"))).size).toBe(3);
  expect(screen.queryByRole("link",{name:/View approved file/})).toBeNull();
  expect(screen.queryByRole("navigation",{name:"Approved document pages"})).toBeNull();
  expect(document.querySelectorAll("article,details")).toHaveLength(0);
  expect(rpc).toHaveBeenCalledWith("get_interdisciplinary_documents",expect.objectContaining({filter_discipline:"",page_offset:0}));
});
it("shows an empty folder overview when the project has no approved disciplines",async()=>{
  rpc.mockResolvedValue({data:{total:0,disciplines:[],documents:[]},error:null});render(await libraryPage());
  expect(screen.getByText(/Discipline folders will appear when documents are approved/)).toBeTruthy();
  expect(screen.queryByRole("navigation",{name:"Approved document pages"})).toBeNull();
  expect(screen.queryByRole("link",{name:/View approved file/})).toBeNull();
});
it("keeps filters and pagination inside the selected discipline folder",async()=>{
  rpc.mockResolvedValue({data:{total:76,disciplines:["Mechanical","Process"],documents:[documentRow()]},error:null});
  render(await libraryPage({q:"MEC & layout",discipline:"Mechanical",page:"2"}));
  expect(screen.getByText("DCC approved")).toBeTruthy();expect(screen.getByRole("heading",{level:2,name:/Mechanical/})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Apply filters"}).closest("form")?.method).toBe("get");
  expect(rpc).toHaveBeenCalledWith("get_interdisciplinary_documents",expect.objectContaining({search_text:"MEC & layout",filter_discipline:"Mechanical",page_offset:25}));
  const next=linkUrl(screen.getByRole("link",{name:/Next/})),previous=linkUrl(screen.getByRole("link",{name:/Previous/}));
  expect(next.searchParams.get("q")).toBe("MEC & layout");expect(next.searchParams.get("discipline")).toBe("Mechanical");expect(next.searchParams.get("page")).toBe("3");
  expect(previous.searchParams.get("discipline")).toBe("Mechanical");expect(previous.searchParams.get("page")).toBe("1");
  const file=linkUrl(screen.getByRole("link",{name:/View approved file/}));
  expect(file.pathname).toBe(`${base}/${revisionId}`);expect(file.searchParams.get("q")).toBe("MEC & layout");expect(file.searchParams.get("page")).toBe("2");
});
it("provides approved-file and native links without upload or DCC approval controls",async()=>{render(await revisionPage());expect(screen.getByRole("link",{name:/View approved file/}).getAttribute("href")).toContain(`/interdisciplinary/${revisionId}/file`);expect(screen.getByRole("link",{name:"Download native file"})).toBeTruthy();expect(screen.getByRole("button",{name:"Record interdisciplinary check"})).toBeTruthy();expect(screen.queryByRole("button",{name:"Approve submission"})).toBeNull();expect(document.querySelector('input[type="file"]')).toBeNull();});
it("requires feedback when requesting changes",async()=>{render(await revisionPage());fireEvent.change(screen.getByRole("combobox",{name:"Interdisciplinary decision"}),{target:{value:"changes_requested"}});expect((screen.getByRole("textbox",{name:"Required changes"}) as HTMLTextAreaElement).required).toBe(true);expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);});
it("hides sign-off even if the preview response accidentally advertises it",async()=>{preview={};render(await revisionPage());expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();expect(screen.getByRole("link",{name:/View approved file/})).toBeTruthy();});
it("explains stale revisions and keeps their history visible",async()=>{rpc.mockResolvedValue({data:{...detail(),isCurrent:false,canSignOff:false,checks:[{id:"check",decision:"changes_requested",comment:"Revise nozzle clearance",reviewer_name:"Process reviewer",reviewer_role:"engineer",reviewer_disciplines:["Process"],created_at:"2026-09-02",is_mine:false,is_latest:true}]},error:null});render(await revisionPage());expect(screen.getByText(/A newer approved revision exists/)).toBeTruthy();expect(screen.getByText("Revise nozzle clearance")).toBeTruthy();expect(screen.queryByRole("button",{name:"Record interdisciplinary check"})).toBeNull();});
it("does not display an unavailable or unauthorised revision",async()=>{rpc.mockResolvedValue({data:null,error:{code:"42501"}});await expect(revisionPage()).rejects.toThrow("not found");});
it("does not turn an RPC failure into an empty library",async()=>{rpc.mockResolvedValue({data:null,error:{code:"XX000"}});await expect(libraryPage()).rejects.toThrow("could not be loaded");});
it("nests purpose groups inside a discipline and places the most recently submitted group first",async()=>{
  const documents=[
    {document_id:"design",title:"Newest design",issue_status:"IFD"},
    {document_id:"new",title:"Newest review",issue_status:"IFR"},
    {document_id:"approval",title:"Approval document",issue_status:"Issued for Approval (IFA)"},
    {document_id:"old",title:"Older review",issue_status:"Issued for Review (IFR)"},
    {document_id:"construction",title:"Construction document",issue_status:"IFC"},
  ].map(row=>documentRow({...row,revision_id:row.document_id,document_number:row.document_id,revision_code:"01",issue_date:null}));
  rpc.mockResolvedValue({data:{total:5,disciplines:["Mechanical"],documents},error:null});
  render(await libraryPage({discipline:"Mechanical"}));
  const groups=Array.from(document.querySelectorAll("details"));
  expect(groups).toHaveLength(4);
  expect(groups.map(group=>group.querySelector("h3")?.textContent)).toEqual([
    "Issued for Design (IFD) 1 document","Issued for Review (IFR) 2 documents","Issued for Approval (IFA) 1 document","Issued for Construction (IFC) 1 document",
  ]);
  expect(Array.from(groups[1].querySelectorAll("h4")).map(node=>node.textContent)).toEqual(["Newest review","Older review"]);
  expect(groups.map(group=>group.hasAttribute("open"))).toEqual([true,false,false,false]);
});
it("retains custom issue purposes while merging canonical purpose labels",async()=>{
  const documents=[
    documentRow({document_id:"custom-new",revision_id:"custom-new",title:"New coordination",issue_status:"Coordination Issue"}),
    documentRow({document_id:"review-new",revision_id:"review-new",title:"Recent review",issue_status:"IFR"}),
    documentRow({document_id:"custom-old",revision_id:"custom-old",title:"Old coordination",issue_status:"coordination issue"}),
    documentRow({document_id:"review-old",revision_id:"review-old",title:"Earlier review",issue_status:"Issued for Review (IFR)"}),
  ];
  rpc.mockResolvedValue({data:{total:4,disciplines:["Mechanical"],documents},error:null});render(await libraryPage({discipline:"Mechanical"}));
  const groups=Array.from(document.querySelectorAll("details"));
  expect(groups.map(group=>group.querySelector("h3")?.textContent)).toEqual(["Coordination Issue 2 documents","Issued for Review (IFR) 2 documents"]);
  expect(Array.from(groups[0].querySelectorAll("h4")).map(node=>node.textContent)).toEqual(["New coordination","Old coordination"]);
});
it("labels the submission date used for recent ordering and falls back to the issue date",async()=>{
  rpc.mockResolvedValue({data:{total:2,disciplines:["Mechanical"],documents:[
    documentRow({document_id:"new",revision_id:"new",title:"Recent upload",submitted_at:"2026-10-04T09:00:00Z",issue_date:"2026-09-01"}),
    documentRow({document_id:"legacy",revision_id:"legacy",title:"Earlier record",issue_date:"2026-09-02"}),
  ]},error:null});render(await libraryPage({discipline:"Mechanical"}));
  expect(screen.getByRole("heading",{level:4,name:"Recent upload"}).closest("article")?.textContent).toMatch(/Submitted 04 Oct 2026/);
  expect(screen.getByRole("heading",{level:4,name:"Earlier record"}).closest("article")?.textContent).toMatch(/Issued 02 Sept 2026/);
});
it("returns from a document to its actual discipline folder with the search and page preserved",async()=>{
  render(await revisionPage({q:"MEC & layout",page:"3",discipline:"Process"}));
  const back=linkUrl(screen.getByRole("link",{name:/Mechanical.*folder/}));
  expect(back.pathname).toBe(base);expect(back.searchParams.get("discipline")).toBe("Mechanical");expect(back.searchParams.get("q")).toBe("MEC & layout");expect(back.searchParams.get("page")).toBe("3");
});
it("returns directly opened documents to the first page of their discipline folder",async()=>{
  render(await revisionPage());const back=linkUrl(screen.getByRole("link",{name:/Mechanical.*folder/}));
  expect(back.searchParams.get("discipline")).toBe("Mechanical");expect(back.searchParams.get("page")).toBe("1");
});
