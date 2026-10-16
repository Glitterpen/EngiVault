import {cleanup,render,screen,within} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {SubmissionReviewQueue,type SubmissionReviewRow} from "./submission-review-queue";

vi.mock("@/app/app/workflow-actions",()=>({reviewRevision:vi.fn()}));
vi.mock("@/components/revision-processing-status",()=>({RevisionProcessingStatus:({endpoint,initialRevisionState,canRetry}:{endpoint:string;initialRevisionState:string;canRetry:boolean})=><div data-testid="processing-status" data-endpoint={endpoint} data-can-retry={String(canRetry)}>{initialRevisionState} checks</div>}));
afterEach(cleanup);
const props={organisationId:"org",projectId:"project"};
const row=(state="ready"):SubmissionReviewRow=>({id:"revision",document_id:"document",revision_code:"IFD",issue_status:"Issued for Design (IFD)",original_filename:"deliverable.pdf",native_original_filename:"deliverable.dwg",created_at:"2026-10-16T09:00:00Z",state,documents:{document_number:"DOC-001",title:"Design basis",discipline:"Process"}});

describe("submission review status presentation",()=>{
  it("keeps file Ready distinct from Submitted and still requires a DCC review decision",()=>{
    render(<SubmissionReviewQueue {...props} rows={[row()]}/>);
    const badge=screen.getByText("Ready"),summary=document.querySelector("summary")!;
    expect(badge.className).toContain("bg-[#edf2f8]");
    expect(badge.hasAttribute("aria-live")).toBe(false);
    expect(summary.textContent).toContain("Submitted 16/10/2026");
    expect(summary.textContent).not.toMatch(/Accepted|Transmitted|Transmittal generated/);
    const confirmation=screen.getByRole("checkbox") as HTMLInputElement;
    expect(confirmation.required).toBe(true);expect(confirmation.disabled).toBe(false);
    expect((screen.getByRole("button",{name:"Approve submission"}) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button",{name:"Return"}) as HTMLButtonElement).value).toBe("returned");
    expect((screen.getByRole("button",{name:"Approve submission"}) as HTMLButtonElement).value).toBe("accepted");
  });

  it("retains every ready preview/download destination and required review field",()=>{
    render(<SubmissionReviewQueue {...props} rows={[row()]}/>);
    expect(screen.getByRole("link",{name:/Open secure preview for DOC-001/}).getAttribute("href")).toBe("/app/org/projects/project/documents/document/revisions/revision/preview");
    expect(screen.getByRole("link",{name:"Download original file for DOC-001, revision IFD"}).getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/documents/document/revisions/revision/download");
    expect(screen.getByRole("link",{name:"Download native source for DOC-001, revision IFD"}).getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/documents/document/revisions/revision/native-download");
    expect(document.querySelector<HTMLInputElement>('input[name="organisationId"]')?.value).toBe("org");
    expect(document.querySelector<HTMLInputElement>('input[name="projectId"]')?.value).toBe("project");
    expect(document.querySelector<HTMLInputElement>('input[name="revisionId"]')?.value).toBe("revision");
  });

  it.each([["quarantined","Processing","bg-[#fff2e9]"],["queued","Processing","bg-[#fff2e9]"],["processing","Processing","bg-[#fff2e9]"],["failed","Failed","bg-[#fff0eb]"],["pending_validation","pending validation","bg-[#f3f6f9]"]])("preserves the %s label and processing gate",(state,label,toneClass)=>{
    render(<SubmissionReviewQueue {...props} rows={[row(state)]}/>);
    const summary=document.querySelector("summary")!;
    expect(within(summary).getByText(label).className).toContain(toneClass);
    expect(document.querySelector('a[href$="/preview"],a[href$="/download"],a[href$="/native-download"]')).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button",{name:"Approve submission"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("processing-status").getAttribute("data-endpoint")).toBe("/api/v1/organisations/org/projects/project/documents/document/revisions/revision/processing");
    expect(screen.getByTestId("processing-status").getAttribute("data-can-retry")).toBe("true");
  });

  it("keeps audited-preview review and retry permissions unchanged",()=>{
    const {rerender}=render(<SubmissionReviewQueue {...props} rows={[row()]} readOnly/>);
    expect(screen.getByText("Ready")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    for(const name of ["Approve submission","Return"])expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link",{name:/Open secure preview for DOC-001/})).toBeTruthy();
    rerender(<SubmissionReviewQueue {...props} rows={[row("failed")]} readOnly/>);
    expect(screen.getByTestId("processing-status").getAttribute("data-can-retry")).toBe("false");
  });
});
