import {createRef} from "react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {FormField} from "./form-field";

afterEach(cleanup);

describe("FormField labels and accessibility relationships",()=>{
  it("supplies stable unique IDs without changing control values or native constraints",()=>{
    const renderFields=()=><><FormField label="Document title"><input name="title" defaultValue="Design basis" required minLength={2} maxLength={80}/></FormField><FormField label="Project title"><input name="project"/></FormField></>;
    const view=render(renderFields());
    const first=screen.getByLabelText("Document title") as HTMLInputElement;
    const second=screen.getByLabelText("Project title");const ids=[first.id,second.id];
    expect(ids.every(Boolean)).toBe(true);expect(new Set(ids).size).toBe(2);
    expect(first.name).toBe("title");expect(first.value).toBe("Design basis");expect(first.required).toBe(true);expect(first.minLength).toBe(2);expect(first.maxLength).toBe(80);
    view.rerender(renderFields());expect([screen.getByLabelText("Document title").id,screen.getByLabelText("Project title").id]).toEqual(ids);
  });
  it("preserves an existing ID, description tokens and invalid state unless explicitly given an error",()=>{
    render(<><span id="external-hint">Existing help</span><FormField label="Email" description="Use your work email."><input id="work-email" name="email" type="email" aria-describedby="external-hint work-email-description" aria-invalid="spelling"/></FormField></>);
    const input=screen.getByLabelText("Email");
    expect(input.id).toBe("work-email");expect(input.getAttribute("aria-describedby")).toBe("external-hint work-email-description");expect(input.getAttribute("aria-invalid")).toBe("spelling");
    expect(document.getElementById("work-email-description")?.textContent).toBe("Use your work email.");
  });
  it("associates explicit error and description IDs, deduplicates tokens and clears only its own relationships",()=>{
    const field=(error?:string)=><FormField id="email" label="Email" description="Use your work email." error={error}><input name="email" aria-describedby="external-email-note"/></FormField>;
    const view=render(field("Enter a valid email."));const input=screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBe("external-email-note email-description email-error");expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").id).toBe("email-error");expect(screen.getByRole("alert").textContent).toBe("Enter a valid email.");
    view.rerender(field());expect(screen.getByLabelText("Email").getAttribute("aria-describedby")).toBe("external-email-note email-description");expect(screen.getByLabelText("Email").hasAttribute("aria-invalid")).toBe(false);expect(screen.queryByRole("alert")).toBeNull();
  });
  it("honours the explicit field ID without mutating the supplied element",()=>{
    const child=<input id="original-id" name="title" defaultValue="Original"/>;
    render(<FormField id="chosen-id" label="Title">{child}</FormField>);
    expect(screen.getByLabelText("Title").id).toBe("chosen-id");expect(child.props.id).toBe("original-id");expect(child.props.name).toBe("title");expect(child.props.defaultValue).toBe("Original");
  });
  it("keeps native handlers, refs, controlled values, attributes and validation under the caller's ownership",()=>{
    const change=vi.fn(),focus=vi.fn(),ref=createRef<HTMLInputElement>();
    render(<FormField label="Work email"><input ref={ref} name="workEmail" type="email" value="owner@example.test" onChange={change} onFocus={focus} autoComplete="email" required pattern=".+@example[.]test" minLength={5} maxLength={100} data-fixture="preserved"/></FormField>);
    const input=screen.getByLabelText("Work email") as HTMLInputElement;
    expect(ref.current).toBe(input);expect(input.value).toBe("owner@example.test");expect(input.name).toBe("workEmail");expect(input.type).toBe("email");expect(input.autocomplete).toBe("email");expect(input.pattern).toBe(".+@example[.]test");expect(input.required).toBe(true);expect(input.minLength).toBe(5);expect(input.maxLength).toBe(100);expect(input.dataset.fixture).toBe("preserved");
    fireEvent.change(input,{target:{value:"other@example.test"}});expect(change).toHaveBeenCalledTimes(1);input.focus();expect(focus).toHaveBeenCalledTimes(1);
  });
  it("preserves select, textarea and checkbox fields rather than replacing their semantics",()=>{
    render(<form><FormField label="Discipline"><select name="discipline" defaultValue="Process" required><option value="Process">Process</option><option value="Electrical">Electrical</option></select></FormField><FormField label="Description"><textarea name="description" defaultValue="Project scope" rows={4} maxLength={200}/></FormField><FormField label="Enabled"><input type="checkbox" name="enabled" value="yes" defaultChecked/></FormField></form>);
    expect((screen.getByLabelText("Discipline") as HTMLSelectElement).value).toBe("Process");expect(screen.getByRole("combobox").getAttribute("name")).toBe("discipline");
    expect((screen.getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Project scope");expect((screen.getByLabelText("Description") as HTMLTextAreaElement).rows).toBe(4);expect((screen.getByLabelText("Description") as HTMLTextAreaElement).maxLength).toBe(200);
    expect((screen.getByRole("checkbox",{name:"Enabled"}) as HTMLInputElement).checked).toBe(true);
    expect(Object.fromEntries(new FormData(screen.getByRole("checkbox").closest("form")!))).toEqual({discipline:"Process",description:"Project scope",enabled:"yes"});
  });
  it("keeps optional help outside the label and out of form submission",()=>{
    render(<FormField label="Issue date" help={{label:"Issue date guidance",content:"Use the agreed first issue date."}}><input name="date" type="date" required/></FormField>);
    const help=screen.getByRole("button",{name:"Issue date guidance"});expect(help.closest("label")).toBeNull();expect(help.getAttribute("type")).toBe("button");expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(help);expect(screen.getByRole("tooltip").textContent).toBe("Use the agreed first issue date.");expect(screen.getByLabelText("Issue date").getAttribute("type")).toBe("date");
  });
  it("does not create blank error/description announcements",()=>{
    render(<FormField label="Title" description="" error=""><input name="title" disabled readOnly/></FormField>);
    const input=screen.getByLabelText("Title") as HTMLInputElement;expect(input.disabled).toBe(true);expect(input.readOnly).toBe(true);expect(input.hasAttribute("aria-describedby")).toBe(false);expect(input.hasAttribute("aria-invalid")).toBe(false);expect(screen.queryByRole("alert")).toBeNull();
  });
});
