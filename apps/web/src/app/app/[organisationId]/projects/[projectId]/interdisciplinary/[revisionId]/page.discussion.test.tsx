import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import Page from "./page";
import {requireProject} from "@/lib/auth";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/components/interdisciplinary-check-form",()=>({InterdisciplinaryCheckForm:()=> <div>Formal check form</div>}));
vi.mock("@/components/interdisciplinary-comment-form",()=>({InterdisciplinaryCommentForm:()=> <div>Add discussion form</div>}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found");}}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001",revisionId="c0000000-0000-4000-8000-000000000001";
const rpc=vi.fn();const comment={id:"comment",kind:"query",body:"Please confirm the pump isolation",author_role:"engineer",author_disciplines:["Process"],created_at:"2026-10-18T09:00:00Z",author_name:"Process Engineer",is_mine:false};
function detail(){return {documentId:"document",documentNumber:"MEC-001",title:"Mechanical layout",discipline:"Mechanical",documentType:"Drawing",revisionId,revisionCode:"IFR",issueStatus:"Issued for Review (IFR)",issueDate:null,approvedAt:null,filename:"layout.pdf",hasNative:false,isCurrent:false,canSignOff:false,canComment:true,checks:[],comments:[comment],commentTotal:1};}
function access(role="engineer",preview=false){vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role},preview:preview?{}:null} as never);}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({data:detail(),error:null});});afterEach(cleanup);
async function renderPage(search:Record<string,string>={}){render(await Page({params:Promise.resolve({organisationId,projectId,revisionId}),searchParams:Promise.resolve(search)}));}
it("allows discussion on an older accepted issue without showing formal sign-off",async()=>{await renderPage();expect(screen.getByText("Add discussion form")).toBeTruthy();expect(screen.queryByText("Formal check form")).toBeNull();expect(screen.getByText("Please confirm the pump isolation")).toBeTruthy();expect(screen.getByText("Query — response requested")).toBeTruthy();expect(screen.getByRole("link",{name:"View approved file ↗"})).toBeTruthy();expect(rpc).toHaveBeenCalledTimes(1);});
it.each(["organisation_admin","viewer","executive_viewer"])("does not render comment controls for %s even if a stale flag says allowed",async role=>{access(role);await renderPage();expect(screen.queryByText("Add discussion form")).toBeNull();expect(screen.getByText("Discussion is read-only for your current access.")).toBeTruthy();});
it("never renders discussion mutation in audited role preview",async()=>{access("engineer",true);await renderPage();expect(screen.queryByText("Add discussion form")).toBeNull();expect(screen.getByText("Please confirm the pump isolation")).toBeTruthy();});
it("pages all discussion entries with scope-preserving read-only links",async()=>{
  rpc.mockResolvedValueOnce({data:{...detail(),commentTotal:201},error:null}).mockResolvedValueOnce({data:{total:201,comments:[{...comment,id:"older",body:"Earlier coordination query"}]},error:null});
  await renderPage({q:"pump isolation",page:"3",discussionPage:"2"});expect(rpc).toHaveBeenLastCalledWith("get_interdisciplinary_comments",{target_organisation:organisationId,target_project:projectId,target_revision:revisionId,page_offset:100});expect(screen.getByText("Earlier coordination query")).toBeTruthy();expect(screen.queryByText("Please confirm the pump isolation")).toBeNull();
  const next=new URL(screen.getByRole("link",{name:"Older messages"}).getAttribute("href")!,"https://app.test");expect(next.searchParams.get("q")).toBe("pump isolation");expect(next.searchParams.get("page")).toBe("3");expect(next.searchParams.get("discussionPage")).toBe("3");expect(next.hash).toBe("#discussion");
});
it("does not disguise a failed discussion page as an empty thread",async()=>{
  rpc.mockResolvedValueOnce({data:detail(),error:null}).mockResolvedValueOnce({data:null,error:{code:"XX000",message:"private"}});await renderPage({discussionPage:"2"});expect(screen.getByRole("alert").textContent).toContain("could not be loaded");expect(screen.queryByText("No messages on this page.")).toBeNull();expect(screen.queryByText("private")).toBeNull();
});
