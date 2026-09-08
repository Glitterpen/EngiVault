import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {RevisionProcessingStatus} from "./revision-processing-status";
const {router}=vi.hoisted(()=>({router:{refresh:vi.fn()}}));
vi.mock("next/navigation",()=>({useRouter:()=>router}));
const request=vi.fn();
const run=(state:string,error_code:string|null=null)=>({state,attempt:1,error_code,metrics:null,updated_at:"2026-09-08"});
const response=(revisionState:string,state:string,error_code:string|null=null)=>Response.json({revisionState,run:run(state,error_code)});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",request);request.mockResolvedValue(response("quarantined","queued"));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();});
it("refreshes server-rendered controls when security processing becomes ready",async()=>{
  request.mockResolvedValue(response("ready","ready"));
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="quarantined" initialRun={null} canRetry/>);
  await waitFor(()=>expect(router.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByText("ready")).toBeTruthy();expect(screen.queryByText("Updating automatically")).toBeNull();
});
it("polls a queued retry without submitting a mutation",async()=>{
  vi.useFakeTimers();
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="quarantined" initialRun={null} canRetry/>);
  await act(async()=>{await Promise.resolve()});
  request.mockResolvedValue(response("ready","ready"));
  await act(async()=>{await vi.advanceTimersByTimeAsync(5000)});
  expect(router.refresh).toHaveBeenCalledTimes(1);
  for(const [,options] of request.mock.calls)expect(options.method).not.toBe("POST");
});
it("shows a useful queued failure without exposing infrastructure names",async()=>{
  request.mockResolvedValue(response("quarantined","queued","PROCESSOR_ERROR"));
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="quarantined" initialRun={null} canRetry/>);
  await waitFor(()=>expect(screen.getByText(/Another processing attempt is queued/)).toBeTruthy());
  expect(screen.queryByText(/PROCESSOR_ERROR/)).toBeNull();
});
it("allows the DCC to retry failed processing and resumes live updates",async()=>{
  request.mockResolvedValue(response("failed","failed","PROCESSOR_ERROR"));
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="failed" initialRun={run("failed","PROCESSOR_ERROR")} canRetry/>);
  await waitFor(()=>expect(request).toHaveBeenCalled());
  request.mockImplementation(async(_url:string,options:RequestInit)=>options.method==="POST"?Response.json({state:"queued"}):response("quarantined","queued"));
  fireEvent.click(screen.getByRole("button",{name:"Retry processing"}));
  await waitFor(()=>expect(screen.getByText("Updating automatically")).toBeTruthy());
  expect(request).toHaveBeenCalledWith("/processing",{method:"POST"});
});
it("keeps retry unavailable in read-only preview",async()=>{
  request.mockResolvedValue(response("failed","failed"));
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="failed" initialRun={run("failed")} canRetry={false}/>);
  await waitFor(()=>expect(request).toHaveBeenCalled());expect(screen.queryByRole("button",{name:"Retry processing"})).toBeNull();
});
it("shows a status-read failure with a refresh option",async()=>{
  request.mockResolvedValue(new Response(null,{status:503}));
  render(<RevisionProcessingStatus endpoint="/processing" initialRevisionState="quarantined" initialRun={null} canRetry/>);
  await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("could not be checked"));
  expect(screen.getByRole("button",{name:"Refresh status"})).toBeTruthy();
});
