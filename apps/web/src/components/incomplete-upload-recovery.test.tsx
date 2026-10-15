import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {IncompleteUploadRecovery} from "./incomplete-upload-recovery";
const refresh=vi.fn();
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
vi.mock("@/lib/supabase/browser",()=>({createClient:()=>({storage:{from:()=>({})}})}));
const fetchMock=vi.fn();
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("requires confirmation before cancellation",async()=>{
  fetchMock.mockResolvedValue(Response.json({cancelled:true}));
  render(<IncompleteUploadRecovery endpoint="/revision/recovery"/>);
  fireEvent.click(screen.getByRole("button",{name:"Cancel incomplete upload"}));
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Confirm cancellation"}));
  await waitFor(()=>expect(refresh).toHaveBeenCalled());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({action:"cancel"});
});
it("requests only the missing native file",async()=>{
  fetchMock.mockResolvedValue(Response.json({files:[{kind:"native",name:"source.dwg"}]}));
  render(<IncompleteUploadRecovery endpoint="/revision/recovery"/>);
  fireEvent.click(screen.getByRole("button",{name:"Resume incomplete submission"}));
  expect(await screen.findByLabelText("Missing native source: source.dwg")).toBeTruthy();
  expect(screen.queryByLabelText(/Missing controlled file/)).toBeNull();
  expect((screen.getByRole("button",{name:"Complete secure submission"}) as HTMLButtonElement).disabled).toBe(true);
});
it("uses normal completion when all files already exist",async()=>{
  fetchMock.mockResolvedValueOnce(Response.json({files:[]})).mockResolvedValueOnce(Response.json({state:"queued"}));
  render(<IncompleteUploadRecovery endpoint="/revision/recovery"/>);
  fireEvent.click(screen.getByRole("button",{name:"Resume incomplete submission"}));
  fireEvent.click(await screen.findByRole("button",{name:"Complete secure submission"}));
  await waitFor(()=>expect(refresh).toHaveBeenCalled());
  expect(fetchMock.mock.calls[1][0]).toBe("/revision/complete");
});
it("keeps recovery visible with phone-sized controls and wrapping missing file names",async()=>{
  const name="very-long-original-native-engineering-drawing-for-revision-source-file.dwg";
  fetchMock.mockResolvedValue(Response.json({files:[{kind:"native",name}]}));
  render(<IncompleteUploadRecovery endpoint="/revision/recovery"/>);
  expect(screen.getByRole("region",{name:"Incomplete submission"})).toBeTruthy();
  for(const button of screen.getAllByRole("button")){
    expect(button.classList.contains("min-h-11")).toBe(true);
    expect(button.classList.contains("w-full")).toBe(true);
  }
  fireEvent.click(screen.getByRole("button",{name:"Resume incomplete submission"}));
  const input=await screen.findByLabelText(`Missing native source: ${name}`);
  expect(input.getAttribute("type")).toBe("file");
  expect(screen.getByText(name).classList.contains("break-all")).toBe(true);
});
it("keeps cancellation optional without a request when the user keeps the upload",()=>{
  render(<IncompleteUploadRecovery endpoint="/revision/recovery"/>);
  fireEvent.click(screen.getByRole("button",{name:"Cancel incomplete upload"}));
  expect(screen.getByText(/Completed revisions are not affected/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Keep upload"}));
  expect(screen.queryByRole("button",{name:"Confirm cancellation"})).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});
