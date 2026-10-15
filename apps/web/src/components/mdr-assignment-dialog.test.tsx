import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {MdrAssignmentDialog} from "./mdr-assignment-dialog";

beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});

it("opens a labelled native modal from the Assign Deliverables toolbar button",()=>{
  render(<MdrAssignmentDialog><label>Discipline<select defaultValue="Electrical"><option>Electrical</option></select></label></MdrAssignmentDialog>);
  const trigger=screen.getByRole("button",{name:"Assign Deliverables"});
  expect(trigger.getAttribute("type")).toBe("button");
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("dialog",{name:"Assign Deliverables"})).toBeNull();
  fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Assign Deliverables"});
  expect(dialog.tagName).toBe("DIALOG");
  expect(dialog.id).toBe(trigger.getAttribute("aria-controls"));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(within(dialog).getByRole("combobox",{name:"Discipline"})).toBeTruthy();
});

it("closes without submitting, restores focus and preserves an unfinished selection",()=>{
  const submit=vi.fn(event=>event.preventDefault());
  render(<MdrAssignmentDialog><form onSubmit={submit}><label>Discipline<select defaultValue="Electrical"><option>Electrical</option><option>Instrumentation</option></select></label><button type="submit">Assign remaining 3</button></form></MdrAssignmentDialog>);
  const trigger=screen.getByRole("button",{name:"Assign Deliverables"});
  fireEvent.click(trigger);
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline"}),{target:{value:"Instrumentation"}});
  const close=screen.getByRole("button",{name:/^Close Assign Deliverables$/i});
  expect(close.getAttribute("type")).toBe("button");
  fireEvent.click(close);
  expect(submit).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog",{name:"Assign Deliverables"})).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  expect((screen.getByRole("combobox",{name:"Discipline"}) as HTMLSelectElement).value).toBe("Instrumentation");
});

it("restores the toolbar focus when the native modal closes through keyboard dismissal",()=>{
  render(<MdrAssignmentDialog><p>Read-only assignment overview.</p></MdrAssignmentDialog>);
  const trigger=screen.getByRole("button",{name:"Assign Deliverables"});
  fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Assign Deliverables"}) as HTMLDialogElement;
  // A browser dispatches close after its native Escape handling; JSDOM has no top layer.
  act(()=>dialog.close());
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
});

it("marks only navigation controls preview-safe, never the assignment form or mutation button",()=>{
  render(<MdrAssignmentDialog><form><button type="submit">Assign remaining 3</button></form></MdrAssignmentDialog>);
  const trigger=screen.getByRole("button",{name:"Assign Deliverables"});
  expect(trigger.hasAttribute("data-preview-safe")).toBe(true);
  fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Assign Deliverables"});
  expect(within(dialog).getByRole("button",{name:/^Close Assign Deliverables$/i}).hasAttribute("data-preview-safe")).toBe(true);
  expect(dialog.closest("[data-preview-safe]")).toBeNull();
  expect(within(dialog).getByRole("button",{name:"Assign remaining 3"}).closest("[data-preview-safe]")).toBeNull();
});
