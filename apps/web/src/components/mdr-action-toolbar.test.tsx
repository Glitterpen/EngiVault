import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {MdrActionToolbar} from "./mdr-action-toolbar";

afterEach(cleanup);

function renderTools(){
  return render(<MdrActionToolbar primary={<button type="button">Assign Deliverables</button>}><a href="/export">Download MDR</a><a href="/search">Engineering Search</a><button type="button">Import Excel</button></MdrActionToolbar>);
}

it("collapses secondary mobile tools by default but keeps a single copy inline on desktop",()=>{
  renderTools();
  const nav=screen.getByRole("navigation",{name:"MDR actions"});
  const trigger=within(nav).getByRole("button",{name:"More MDR tools"});
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.hasAttribute("data-preview-safe")).toBe(true);
  expect(trigger.className).toContain("sm:hidden");
  const panel=document.getElementById(trigger.getAttribute("aria-controls")!)!;
  expect(panel.className).toContain("hidden");expect(panel.className).toContain("sm:flex");
  expect(within(nav).getAllByRole("button",{name:"Assign Deliverables"})).toHaveLength(1);
  expect(within(nav).getAllByRole("link",{name:"Download MDR"})).toHaveLength(1);
  expect(panel.contains(within(nav).getByRole("button",{name:"Assign Deliverables"}))).toBe(false);
  // Only the disclosure is preview-safe; write controls keep their original safeguards.
  expect(panel.hasAttribute("data-preview-safe")).toBe(false);
  expect(within(panel).getByRole("button",{name:"Import Excel"}).closest("[data-preview-safe]")).toBeNull();
});

it("supports toggle and Escape with focus restored without submitting actions or fetching",()=>{
  const request=vi.fn();vi.stubGlobal("fetch",request);
  try{
    renderTools();
    const trigger=screen.getByRole("button",{name:"More MDR tools"});
    fireEvent.click(trigger);expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const link=screen.getByRole("link",{name:"Engineering Search"});link.focus();
    fireEvent.keyDown(link,{key:"Escape"});
    expect(trigger.getAttribute("aria-expanded")).toBe("false");expect(document.activeElement).toBe(trigger);
    expect(request).not.toHaveBeenCalled();
  }finally{vi.unstubAllGlobals();}
});

it("does not intercept Escape from a nested dialog",()=>{
  render(<MdrActionToolbar primary={<a href="/export">Download MDR</a>}><dialog open><button>Close import</button></dialog></MdrActionToolbar>);
  const trigger=screen.getByRole("button",{name:"More MDR tools"});fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("button",{name:"Close import"}),{key:"Escape"});
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
});
