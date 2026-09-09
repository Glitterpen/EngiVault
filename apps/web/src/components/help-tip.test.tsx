import {afterEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {HelpTip} from "./help-tip";
import {FieldWithHelp} from "./field-with-help";
import {DocumentTypeInput} from "./document-type-input";

afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
const help=()=>screen.getByRole("button",{name:"MDR guidance"});
const fixture=()=>render(<HelpTip label="MDR guidance">Plan your deliverables here.</HelpTip>);

describe("shared contextual help",()=>{
  it("hides guidance until hover and lets the pointer cross into the popup",()=>{
    vi.useFakeTimers();fixture();
    expect(screen.queryByText("Plan your deliverables here.")).toBeNull();
    fireEvent.mouseEnter(help());
    const popup=screen.getByRole("tooltip");
    expect(help().getAttribute("aria-describedby")).toBe(popup.id);
    fireEvent.mouseLeave(help());
    act(()=>vi.advanceTimersByTime(75));
    fireEvent.mouseEnter(popup);
    act(()=>vi.advanceTimersByTime(200));
    expect(screen.getByRole("tooltip")).toBe(popup);
    fireEvent.mouseLeave(popup);
    act(()=>vi.advanceTimersByTime(150));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("opens on keyboard focus, stays while focused and dismisses with Escape or blur",()=>{
    vi.useFakeTimers();fixture();
    act(()=>help().focus());
    fireEvent.mouseLeave(help());
    act(()=>vi.advanceTimersByTime(200));
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.keyDown(help(),{key:"Escape"});
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.activeElement).toBe(help());
    fireEvent.blur(help());fireEvent.focus(help());
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.blur(help());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("supports tap-to-open, tap-to-close and tapping outside",()=>{
    fixture();fireEvent.focus(help());fireEvent.click(help());
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.click(help());expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(help());fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("dismisses help before an enclosing dialog handles Escape",()=>{
    const dismissDialog=vi.fn();document.addEventListener("keydown",dismissDialog);
    try{fixture();fireEvent.click(help());fireEvent.keyDown(help(),{key:"Escape"});
      expect(screen.queryByRole("tooltip")).toBeNull();expect(dismissDialog).not.toHaveBeenCalled();
    }finally{document.removeEventListener("keydown",dismissDialog);}
  });
  it("does not submit a form, change a field or activate an ancestor",()=>{
    const submit=vi.fn(),click=vi.fn();
    render(<form onSubmit={submit} onClick={click}><FieldWithHelp label="Document number" helpLabel="MDR guidance" help="Keep numbers unique."><input name="number" defaultValue="MEC-001"/></FieldWithHelp></form>);
    const field=screen.getByLabelText("Document number");
    expect(help().closest("label")).toBeNull();
    expect(help().getAttribute("type")).toBe("button");
    fireEvent.click(help());
    expect(submit).not.toHaveBeenCalled();expect(click).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("MEC-001");
    expect(help().closest("[data-preview-safe]")).toBeTruthy();
  });
  it("preserves unique field and popup associations when forms repeat",()=>{
    render(<><DocumentTypeInput/><DocumentTypeInput/></>);
    const fields=screen.getAllByLabelText("Document type");
    expect(fields[0].id).not.toBe(fields[1].id);
    const buttons=screen.getAllByRole("button",{name:"Document type guidance"});
    fireEvent.mouseEnter(buttons[0]);fireEvent.mouseEnter(buttons[1]);
    expect(buttons[0].getAttribute("aria-describedby")).not.toBe(buttons[1].getAttribute("aria-describedby"));
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);
  });
  it("clamps long help to a phone viewport and positions above a low trigger",()=>{
    vi.stubGlobal("innerWidth",320);vi.stubGlobal("innerHeight",480);
    vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){
      return (this.tagName==="BUTTON"?{left:290,right:322,top:420,bottom:452,width:32,height:32}:{left:0,right:304,top:0,bottom:200,width:304,height:200}) as DOMRect;
    });
    vi.spyOn(HTMLElement.prototype,"scrollHeight","get").mockReturnValue(200);
    fixture();fireEvent.click(help());const tip=screen.getByRole("tooltip");
    expect(tip.style.width).toBe("304px");expect(tip.style.left).toBe("8px");expect(tip.style.top).toBe("212px");
    expect(Number.parseFloat(tip.style.maxHeight)).toBeLessThan(480);
  });
  it("uses the native top layer when available, including inside a dialog",()=>{
    const show=vi.fn(function(this:HTMLElement){this.style.display="block";});
    Object.defineProperty(HTMLElement.prototype,"showPopover",{configurable:true,value:show});
    try{render(<dialog open><HelpTip label="MDR guidance">Import rules.</HelpTip></dialog>);fireEvent.click(help());
      expect(show).toHaveBeenCalledOnce();expect(document.querySelector('[role="tooltip"]')?.getAttribute("popover")).toBe("manual");
    }finally{delete (HTMLElement.prototype as unknown as {showPopover?:unknown}).showPopover;}
  });
  it("keeps custom document types available with their guidance hidden by default",()=>{
    render(<DocumentTypeInput suggestions={[{code:"REP",name:"Report"}]}/>);
    expect(screen.queryByText(/Not listed/)).toBeNull();
    const input=screen.getByLabelText("Document type") as HTMLInputElement;
    fireEvent.change(input,{target:{value:"Vendor data sheet"}});
    expect(input.value).toBe("Vendor data sheet");expect(input.maxLength).toBe(80);
    fireEvent.click(screen.getByRole("button",{name:"Document type guidance"}));
    expect(screen.getByRole("tooltip").textContent).toContain("Not listed?");
  });
});
