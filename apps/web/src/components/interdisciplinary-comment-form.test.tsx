import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {InterdisciplinaryCommentForm} from "./interdisciplinary-comment-form";
import {recordInterdisciplinaryComment} from "@/app/app/interdisciplinary-actions";
vi.mock("@/app/app/interdisciplinary-actions",()=>({recordInterdisciplinaryComment:vi.fn()}));
const scope={organisationId:"org",projectId:"project",revisionId:"revision"};
beforeEach(()=>vi.resetAllMocks());afterEach(cleanup);
it("starts compact discussion closed without calling any mutation",()=>{
  const {container}=render(<InterdisciplinaryCommentForm {...scope} compact/>);
  expect(container.querySelector("details")?.open).toBe(false);expect(screen.getByText("Add comment or query")).toBeTruthy();expect(recordInterdisciplinaryComment).not.toHaveBeenCalled();
});
it("has explicit, keyboard-accessible labels and no review or acceptance checkbox",()=>{
  render(<InterdisciplinaryCommentForm {...scope}/>);
  const body=screen.getByLabelText("Comment or query") as HTMLTextAreaElement;
  expect(body.required).toBe(true);expect(body.minLength).toBe(5);expect(body.maxLength).toBe(2000);expect(body.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByRole("group",{name:"Message type"})).toBeTruthy();expect(screen.getByRole("button",{name:"Send message"}).classList.contains("min-h-11")).toBe(true);
  expect(screen.queryByRole("checkbox")).toBeNull();expect(recordInterdisciplinaryComment).not.toHaveBeenCalled();
});
it("submits exact scope and query body without a formal sign-off",async()=>{
  vi.mocked(recordInterdisciplinaryComment).mockResolvedValue({ok:true,message:"Query recorded."});render(<InterdisciplinaryCommentForm {...scope}/>);
  fireEvent.click(screen.getByRole("radio",{name:"Query — response requested"}));fireEvent.change(screen.getByLabelText("Comment or query"),{target:{value:"Please confirm the interface boundary"}});
  await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Add interdisciplinary comment or query"}));});
  expect(Object.fromEntries(vi.mocked(recordInterdisciplinaryComment).mock.calls[0][1])).toEqual({...scope,kind:"query",body:"Please confirm the interface boundary"});expect(screen.getByRole("status").textContent).toBe("Query recorded.");
});
it("keeps the draft after a failed action and reports the failure as an alert",async()=>{
  vi.mocked(recordInterdisciplinaryComment).mockResolvedValue({message:"Your comment could not be saved."});render(<InterdisciplinaryCommentForm {...scope}/>);
  fireEvent.click(screen.getByRole("radio",{name:"Query — response requested"}));
  const body=screen.getByLabelText("Comment or query") as HTMLTextAreaElement;fireEvent.change(body,{target:{value:"Check the cable routing interface"}});
  await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Add interdisciplinary comment or query"}));});
  expect(body.value).toBe("Check the cable routing interface");expect((screen.getByRole("radio",{name:"Query — response requested"}) as HTMLInputElement).checked).toBe(true);expect(screen.getByRole("alert").textContent).toContain("could not be saved");
});
it("disables all message controls while sending",async()=>{
  let finish!:(value:{ok:boolean;message:string})=>void;vi.mocked(recordInterdisciplinaryComment).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<InterdisciplinaryCommentForm {...scope}/>);
  fireEvent.change(screen.getByLabelText("Comment or query"),{target:{value:"Please check the nozzle location"}});
  await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Add interdisciplinary comment or query"}));});
  expect((screen.getByLabelText("Comment or query").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);expect(screen.getByRole("button",{name:"Sending…"})).toBeTruthy();
  await act(async()=>finish({ok:true,message:"Saved."}));expect((screen.getByLabelText("Comment or query").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(false);
});
