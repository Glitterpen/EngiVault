import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {MdrDocumentActions} from "./mdr-document-actions";
import {setDocumentArchived,type MutationState} from "@/app/app/actions";

const formState=vi.hoisted(()=>({state:undefined as MutationState,pending:false,action:vi.fn()}));
vi.mock("react",async(load)=>({
  ...await load<typeof import("react")>(),
  useActionState:()=>[formState.state,formState.action,formState.pending],
}));
vi.mock("@/app/app/actions",()=>({setDocumentArchived:vi.fn()}));

beforeEach(()=>{
  formState.state=undefined;formState.pending=false;formState.action.mockReset();
  vi.mocked(setDocumentArchived).mockReset();
  vi.spyOn(window,"confirm").mockReturnValue(false);
});
afterEach(()=>{
  // These presentation and cancellation checks must never invoke any mutation.
  expect(formState.action).not.toHaveBeenCalled();
  expect(setDocumentArchived).not.toHaveBeenCalled();
  cleanup();vi.restoreAllMocks();
});

function show(archived=false,compact=true){
  render(<MdrDocumentActions organisationId="organisation" projectId="project" documentId="document" documentNumber="EL-001" archived={archived} compact={compact}/>);
}
function archiveForm(archived=false){
  return screen.getByRole("button",{name:`${archived?"Restore":"Delete"} EL-001`}).closest("form")!;
}

describe("compact MDR document actions",()=>{
  it("keeps edit and delete actions named, reachable and touch sized when their visible text is hidden",()=>{
    show();
    const edit=screen.getByRole("link",{name:"Edit EL-001"});
    const remove=screen.getByRole("button",{name:"Delete EL-001"});
    expect(edit.getAttribute("href")).toBe("/app/organisation/projects/project/documents/document#document-management");
    for(const control of [edit,remove]){
      expect(control.className).toContain("min-h-11");
      expect(control.className).toContain("w-11");
      expect(control.querySelector("span")?.className).toBe("sr-only");
      expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(remove.getAttribute("title")).toBe("Delete from active MDR");
  });

  it.each([false,true])("preserves all server-action scope fields and the correct archive toggle (currently archived: %s)",archived=>{
    show(archived);
    expect(Object.fromEntries(new FormData(archiveForm(archived)))).toEqual({
      organisationId:"organisation",projectId:"project",documentId:"document",archived:String(!archived),
    });
  });

  it("cancels archive submission and keeps the history and document-number reuse warning in its confirmation",()=>{
    show();
    expect(fireEvent.submit(archiveForm())).toBe(false);
    expect(window.confirm).toHaveBeenCalledOnce();
    const prompt=vi.mocked(window.confirm).mock.calls[0][0]!;
    expect(prompt).toContain("Remove EL-001 from the active Master Document Register?");
    expect(prompt).toContain("Its revisions and audit history will be preserved.");
    expect(prompt).toContain("Its document number can be reused.");
    expect(prompt).toContain("Restoring it later requires an available document number.");
  });

  it("exposes restore rather than delete for archived records and can cancel without submitting",()=>{
    show(true);
    const restore=screen.getByRole("button",{name:"Restore EL-001"});
    expect(restore.getAttribute("title")).toBe("Restore to active MDR");
    expect(screen.queryByRole("button",{name:"Delete EL-001"})).toBeNull();
    expect(fireEvent.submit(archiveForm(true))).toBe(false);
    expect(window.confirm).toHaveBeenCalledWith("Restore EL-001 to the active Master Document Register?");
  });

  it.each([false,true])("disables a pending archive or restore and announces its busy state (currently archived: %s)",archived=>{
    formState.pending=true;show(archived);
    const button=screen.getByRole("button",{name:`${archived?"Restore":"Delete"} EL-001`}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.textContent).toBe("Saving…");
  });

  it("announces a failed action while leaving retry available",()=>{
    formState.state={message:"The deliverable could not be removed. Try again."};show();
    expect(screen.getByRole("alert").textContent).toBe(formState.state.message);
    expect((screen.getByRole("button",{name:"Delete EL-001"}) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not announce a successful mutation as an error",()=>{
    formState.state={message:"Deliverable removed.",mutationId:"mutation"};show();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("retains visible labels for existing noncompact consumers",()=>{
    show(false,false);
    expect(screen.getByRole("link",{name:"Edit EL-001"}).querySelector("span")?.className).toBe("");
    expect(screen.getByRole("button",{name:"Delete EL-001"}).querySelector("span")?.className).toBe("");
  });
});
