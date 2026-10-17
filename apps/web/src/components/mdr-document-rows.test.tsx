import {cleanup,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {MdrDocumentRows} from "./mdr-document-rows";
import type {MdrDocument,MdrRevision} from "@/lib/mdr-register-types";

vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:({documentNumber}:{documentNumber:string})=><button>Manage {documentNumber}</button>}));
afterEach(cleanup);

const revision=(overrides:Partial<MdrRevision>={}):MdrRevision=>({id:"latest",revision_code:"R01",issue_status:"Issued for Review (IFR)",state:"ready",control_status:"accepted",created_at:"2026-10-15T10:00:00Z",...overrides});
const document=(revisions:MdrRevision[]=[]):MdrDocument=>({
  id:"document",document_number:"EL-001",title:"Electrical load list",document_type:"List",discipline:"Electrical",status:"draft",area:null,system:null,work_package:null,
  planned_submission_date:"2026-10-20",updated_at:"2026-10-15T09:00:00Z",lifecycle_status:"active",document_revisions:revisions,
  schedule:{document_id:"document",planned_submission_date:"2026-10-20",next_submission_date:"2026-10-20",last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",overdue:false},
});
const rows=(revisions:MdrRevision[]=[],canManage=false)=>render(<MdrDocumentRows docs={[document(revisions)]} organisationId="org" projectId="project" canManage={canManage} title="Electrical"/>);

it.each([
  ["Issued for Review (IFR)","R01","IFR"],
  ["Issued for Approval (IFA)","A01","IFA"],
  ["Issued for Design (IFD)","IFD","IFD"],
  ["Issued for Construction (IFC)","C01","IFC"],
])("shows %s initials instead of a stale MDR draft status on phone and desktop",(purpose,revisionCode,code)=>{
  rows([revision({issue_status:purpose,revision_code:revisionCode})]);
  expect(screen.getAllByText(code,{exact:true})).toHaveLength(2);
  expect(screen.queryByText(/^draft$/i)).toBeNull();
  const desktop=screen.getByRole("region",{name:/Master document register — Electrical/});
  expect(within(desktop).getByRole("columnheader",{name:"Status"})).toBeTruthy();
  expect(within(desktop).getByText(code,{exact:true}).getAttribute("title")).toContain(purpose);
});

it("uses the latest submitted issue purpose rather than array order or revision code",()=>{
  rows([
    revision({id:"first",revision_code:"R01",issue_status:"Issued for Review (IFR)",created_at:"2026-10-01T10:00:00Z"}),
    revision({id:"latest",revision_code:"A02",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-15T10:00:00Z",control_status:"submitted"}),
    revision({id:"middle",revision_code:"IFD",issue_status:"Issued for Design (IFD)",created_at:"2026-10-10T10:00:00Z"}),
  ]);
  expect(screen.getAllByText("IFA",{exact:true})).toHaveLength(2);
  expect(screen.queryByText("IFR",{exact:true})).toBeNull();
  expect(screen.queryByText("IFD",{exact:true})).toBeNull();
});

it("does not mistake newer incomplete, cancelled or superseded revisions for a submitted issue",()=>{
  rows([
    revision({id:"approved",issue_status:"Issued for Review (IFR)",created_at:"2026-10-10T10:00:00Z"}),
    revision({id:"incomplete",issue_status:"Issued for Design (IFD)",created_at:"2026-10-15T10:00:00Z",state:"pending_upload",control_status:"submitted"}),
    revision({id:"cancelled",issue_status:"Issued for Construction (IFC)",created_at:"2026-10-16T10:00:00Z",state:"cancelled",control_status:"submitted"}),
    revision({id:"superseded",issue_status:"Issued for Approval (IFA)",created_at:"2026-10-17T10:00:00Z",state:"superseded"}),
  ]);
  expect(screen.getAllByText("IFR",{exact:true})).toHaveLength(2);
  for(const purpose of ["IFA","IFD","IFC"])expect(screen.queryByText(purpose,{exact:true})).toBeNull();
});

it("shows Not submitted when no complete submission exists, rather than inventing a purpose",()=>{
  rows([revision({state:"pending_upload",control_status:"submitted"})]);
  expect(screen.getAllByText("Not submitted",{exact:true})).toHaveLength(2);
  expect(screen.queryByText(/^draft$/i)).toBeNull();
  expect(screen.queryByText("IFR",{exact:true})).toBeNull();
});

it("keeps due dates, document links and role-gated row actions alongside the purpose badge",()=>{
  const {rerender}=rows([revision()],true);
  expect(screen.getAllByRole("link",{name:/EL-001.*Electrical load list/}).every(link=>link.getAttribute("href")==="/app/org/projects/project/documents/document")).toBe(true);
  expect(screen.getAllByText("Due 20 Oct 2026",{exact:true})).toHaveLength(2);
  expect(screen.getAllByRole("button",{name:"Manage EL-001"})).toHaveLength(2);
  rerender(<MdrDocumentRows docs={[document([revision()])]} organisationId="org" projectId="project" canManage={false} title="Electrical"/>);
  expect(screen.queryByRole("button",{name:"Manage EL-001"})).toBeNull();
  expect(screen.getAllByText("IFR",{exact:true})).toHaveLength(2);
});

it("carries only the current MDR browsing query on both mobile and desktop document links",()=>{
  const query="q=load&records=removed&folder=Electrical&folderPage=2";
  render(<MdrDocumentRows docs={[document()]} organisationId="org" projectId="project" canManage={false} title="Electrical" returnToMdr={query}/>);
  for(const link of screen.getAllByRole("link",{name:/EL-001.*Electrical load list/})){
    const target=new URL(link.getAttribute("href")!,"https://engicite.test");
    expect(target.pathname).toBe("/app/org/projects/project/documents/document");
    expect(target.searchParams.get("mdr")).toBe(query);
  }
});
