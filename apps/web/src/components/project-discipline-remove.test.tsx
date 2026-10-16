import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ProjectDisciplineRemove} from "./project-discipline-remove";
import {inspectProjectDisciplineRemoval,removeProjectDiscipline} from "@/app/app/project-discipline-actions";
vi.mock("@/app/app/project-discipline-actions",()=>({inspectProjectDisciplineRemoval:vi.fn(),removeProjectDiscipline:vi.fn()}));
const impact={name:"Mechanical",engineerCount:2,documentCount:12,invitationCount:1,plannedPositions:3};
beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value(){this.setAttribute("open","");}});
  vi.mocked(inspectProjectDisciplineRemoval).mockResolvedValue({message:"",impact});
});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function open(){render(<ProjectDisciplineRemove organisationId="org" projectId="project" name="Mechanical"/>);fireEvent.click(screen.getByRole("button",{name:"Remove Mechanical"}));}
describe("discipline removal confirmation",()=>{
  it("offers permanent deletion for unused disciplines with explicit acknowledgement",async()=>{
    vi.mocked(inspectProjectDisciplineRemoval).mockResolvedValue({message:"",impact:{...impact,engineerCount:0,documentCount:0,invitationCount:0,canDeletePermanently:true}});
    open();await screen.findByRole("heading",{name:"Permanently delete Mechanical?"});
    expect(screen.getByText(/no entry in Removed disciplines/)).toBeTruthy();
    const checkbox=screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.name).toBe("confirmedPermanent");expect(checkbox.required).toBe(true);expect(checkbox.checked).toBe(false);
    expect(screen.getByRole("button",{name:"Delete permanently"})).toBeTruthy();expect(screen.queryByText("You can restore it later.")).toBeNull();
  });
  it("can clean up an already removed unused discipline",async()=>{
    vi.mocked(inspectProjectDisciplineRemoval).mockResolvedValue({message:"",impact:{...impact,engineerCount:0,canDeletePermanently:true}});
    render(<ProjectDisciplineRemove organisationId="org" projectId="project" name="Mechanical" permanentOnly/>);
    fireEvent.click(screen.getByRole("button",{name:"Delete unused Mechanical"}));await screen.findByRole("button",{name:"Delete permanently"});
  });
  it("will not offer archive or permanent mutation when cleaning up a linked removed discipline",async()=>{
    render(<ProjectDisciplineRemove organisationId="org" projectId="project" name="Mechanical" permanentOnly/>);
    fireEvent.click(screen.getByRole("button",{name:"Delete unused Mechanical"}));await screen.findByText(/Permanent deletion is unavailable/);
    expect(screen.queryByRole("button",{name:"Delete permanently"})).toBeNull();expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
  });
  it("loads live impact and requires acknowledgement when engineers are assigned",async()=>{
    open();expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
    await screen.findByText(/2 engineers are already assigned/);
    expect(screen.getByText(/12 active MDR deliverables/)).toBeTruthy();
    const checkbox=screen.getByRole("checkbox") as HTMLInputElement;
    expect(checkbox.required).toBe(true);expect(checkbox.checked).toBe(false);
    expect(screen.getByText(/Existing engineer access, MDR deliverables, files/)).toBeTruthy();
    expect(removeProjectDiscipline).not.toHaveBeenCalled();
  });
  it("still asks for confirmation when there are no engineers",async()=>{
    vi.mocked(inspectProjectDisciplineRemoval).mockResolvedValue({message:"",impact:{...impact,engineerCount:0}});
    open();await screen.findByText("No active engineers are assigned to this discipline.");
    expect(screen.queryByRole("checkbox")).toBeNull();expect(screen.getByRole("button",{name:"Confirm removal"})).toBeTruthy();
  });
  it("does not permit removal if the warning fails to load",async()=>{
    vi.mocked(inspectProjectDisciplineRemoval).mockRejectedValue(new Error("network"));open();
    await screen.findByRole("alert");expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
  });
  it("cancels without mutation",async()=>{
    open();await screen.findByRole("checkbox");fireEvent.click(screen.getByRole("button",{name:"Keep discipline"}));
    expect(screen.queryByRole("dialog")).toBeNull();expect(removeProjectDiscipline).not.toHaveBeenCalled();
  });
  it("refreshes a stale warning and clears the old acknowledgement",async()=>{
    vi.mocked(removeProjectDiscipline).mockResolvedValue({message:"Assignments changed",impact:{...impact,engineerCount:3}});
    open();fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button",{name:"Confirm removal"}).closest("form")!);
    await screen.findByText(/3 engineers are already assigned/);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    await waitFor(()=>expect(removeProjectDiscipline).toHaveBeenCalled());
  });
  it("preserves the scoped archive payload and accessible touch targets",async()=>{
    vi.mocked(removeProjectDiscipline).mockResolvedValue({ok:true,message:"Mechanical removed from new selections."});
    open();
    expect(screen.getByRole("button",{name:"Remove Mechanical"}).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("button",{name:"Close discipline removal"}).classList.contains("min-w-11")).toBe(true);
    fireEvent.click(await screen.findByRole("checkbox"));
    const form=screen.getByRole("form",{name:"Confirm removal of Mechanical"}) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"org",projectId:"project",name:"Mechanical",confirmed:"true",expectedEngineerCount:"2",mode:"archive",confirmedAssigned:"true"});
    fireEvent.submit(form);
    await screen.findByRole("status");
    expect(removeProjectDiscipline).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(vi.mocked(removeProjectDiscipline).mock.calls[0][1])).toEqual({organisationId:"org",projectId:"project",name:"Mechanical",confirmed:"true",expectedEngineerCount:"2",mode:"archive",confirmedAssigned:"true"});
    expect(screen.queryByRole("button",{name:"Confirm removal"})).toBeNull();
  });
  it("preserves permanent-deletion acknowledgement and mode instead of silently archiving",async()=>{
    vi.mocked(inspectProjectDisciplineRemoval).mockResolvedValue({message:"",impact:{...impact,engineerCount:0,documentCount:0,invitationCount:0,canDeletePermanently:true}});
    vi.mocked(removeProjectDiscipline).mockResolvedValue({ok:true,message:"Mechanical permanently removed."});
    open();fireEvent.click(await screen.findByRole("checkbox"));
    const form=screen.getByRole("form",{name:"Confirm removal of Mechanical"}) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"org",projectId:"project",name:"Mechanical",confirmed:"true",expectedEngineerCount:"0",mode:"permanent",confirmedPermanent:"true"});
    fireEvent.submit(form);await screen.findByRole("status");
    expect(vi.mocked(removeProjectDiscipline).mock.calls[0][1].get("mode")).toBe("permanent");
  });
});
