import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {WorkPackageGenerate} from "./work-package-generate";
import {AdminPreviewBoundary} from "./admin-preview-boundary";

const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
const endpoint="/api/v1/organisations/org/projects/project/work-packages/package/generate";
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe("secure package generation",()=>{
  it("keeps its explicit button type and the existing POST endpoint",async()=>{
    fetchMock.mockResolvedValue({ok:true});
    render(<WorkPackageGenerate endpoint={endpoint}/>);
    const button=screen.getByRole("button",{name:"Generate package ZIP"});
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(endpoint,{method:"POST"});
    expect(screen.getByRole("status").textContent).toBe("Package ready. Refreshing the download…");
  });
  it("announces the custom busy state and prevents duplicate requests",async()=>{
    let finish:(response:{ok:boolean})=>void=()=>{};
    fetchMock.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    render(<WorkPackageGenerate endpoint={endpoint} label="Generate transmittal ZIP" loadingLabel="Preparing transmittal and documents…"/>);
    const button=screen.getByRole("button",{name:"Generate transmittal ZIP"});
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Preparing transmittal and documents…");
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledOnce();
    finish({ok:true});
    await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
    expect(button.getAttribute("aria-busy")).toBe("false");
  });
  it("keeps a useful server validation error visible and allows retry",async()=>{
    fetchMock.mockResolvedValueOnce({ok:false,json:async()=>({error:{message:"Package cannot be generated in its current state."}})}).mockResolvedValueOnce({ok:true});
    render(<WorkPackageGenerate endpoint={endpoint}/>);
    const button=screen.getByRole("button",{name:"Generate package ZIP"});
    fireEvent.click(button);
    const alert=await screen.findByRole("alert");
    expect(alert.textContent).toBe("Package cannot be generated in its current state.");
    expect(button.getAttribute("aria-describedby")).toBe(alert.id);
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not expose infrastructure diagnostics",async()=>{
    fetchMock.mockResolvedValue({ok:false,json:async()=>({error:{message:"Supabase Railway processor secret unavailable"}})});
    render(<WorkPackageGenerate endpoint={endpoint}/>);
    fireEvent.click(screen.getByRole("button",{name:"Generate package ZIP"}));
    expect((await screen.findByRole("alert")).textContent).toBe("Package generation failed. Please try again.");
  });
  it("handles an unreadable error response",async()=>{
    fetchMock.mockResolvedValue({ok:false,json:async()=>{throw new Error("Invalid response");}});
    render(<WorkPackageGenerate endpoint={endpoint}/>);
    fireEvent.click(screen.getByRole("button",{name:"Generate package ZIP"}));
    expect((await screen.findByRole("alert")).textContent).toBe("Package generation failed. Please try again.");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows the existing connection error without losing the retry button",async()=>{
    fetchMock.mockRejectedValue(new Error("network"));
    render(<WorkPackageGenerate endpoint={endpoint}/>);
    fireEvent.click(screen.getByRole("button",{name:"Generate package ZIP"}));
    expect((await screen.findByRole("alert")).textContent).toBe("Package generation could not be completed. Check your connection and try again.");
    expect((screen.getByRole("button",{name:"Generate package ZIP"}) as HTMLButtonElement).disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not unlock generation in audited read-only preview",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"document_controller",displayName:"DCC",disciplines:[],expiresAt:"2099-01-01"}}><WorkPackageGenerate endpoint={endpoint}/></AdminPreviewBoundary>);
    const button=screen.getByRole("button",{name:"Generate package ZIP"});
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // Native activation respects the boundary's DOM-level disabled lock;
    // fireEvent deliberately dispatches even through disabled DOM controls.
    button.click();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
