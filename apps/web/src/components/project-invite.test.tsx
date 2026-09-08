import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {ProjectInvite} from "./project-invite";
const disciplines=[{name:"Electrical",code:"ELE"},{name:"Instrumentation",code:"INS"},{name:"Process",code:"PRO"}];
const request=vi.fn();
beforeEach(()=>{vi.stubGlobal("fetch",request);request.mockResolvedValue({ok:true,json:async()=>({delivery:{emailSent:true,acceptUrl:"https://example.test/invite/test-only"}})});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
function form(){render(<ProjectInvite organisationId="org" projectId="project" disciplines={disciplines} allowedRoles={["engineer"]}/>);fireEvent.change(screen.getByLabelText("Work email"),{target:{value:"engineer@example.test"}});}
describe("Multi-discipline invitation form",()=>{
  it("requires at least one scope and submits multiple selections with one email",async()=>{
    form();
    const submit=screen.getByRole("button",{name:"Create secure invitation"});
    expect(submit.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox",{name:"ELE — Electrical"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"INS — Instrumentation"}));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(submit);
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({email:"engineer@example.test",role:"engineer",disciplines:["Electrical","Instrumentation"]});
    expect(await screen.findByRole("status")).toBeTruthy();
  });
  it("removes unticked disciplines from the invitation",async()=>{
    form();
    const electrical=screen.getByRole("checkbox",{name:"ELE — Electrical"});
    fireEvent.click(electrical);fireEvent.click(screen.getByRole("checkbox",{name:"INS — Instrumentation"}));fireEvent.click(electrical);
    fireEvent.click(screen.getByRole("button",{name:"Create secure invitation"}));
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(request.mock.calls[0][1].body).disciplines).toEqual(["Instrumentation"]);
  });
  it("never submits stale engineer selections when switched to leadership",async()=>{
    render(<ProjectInvite organisationId="org" projectId="project" disciplines={disciplines}/>);
    fireEvent.change(screen.getByLabelText("Work email"),{target:{value:"pm@example.test"}});
    fireEvent.change(screen.getByLabelText("Project role"),{target:{value:"engineer"}});
    fireEvent.click(screen.getByRole("checkbox",{name:"ELE — Electrical"}));
    fireEvent.change(screen.getByLabelText("Project role"),{target:{value:"project_admin"}});
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Create secure invitation"}));
    await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(request.mock.calls[0][1].body).disciplines).toEqual([]);
  });
});
