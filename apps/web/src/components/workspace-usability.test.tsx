import {cleanup,fireEvent,render,screen,act} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {AppDialog} from "./app-dialog";
import {AccountMenu} from "./account-menu";
import {WorkspaceNavigation} from "./workspace-navigation";
vi.mock("next/navigation",()=>({usePathname:()=>"/app"}));
vi.mock("@/app/(auth)/actions",()=>({signOut:vi.fn()}));

it.each([
 ["engineer","My deliverables"],
 ["document_controller","DCC control centre"],
 ["project_admin","Project overview"],
])("deduplicates %s preview dashboard navigation",(role,label)=>{
 render(<WorkspaceNavigation previewScope={{organisationId:"org",projectId:"project",role,disciplines:["Mechanical"]}}/>);
 expect(screen.getAllByRole("link",{name:label})).toHaveLength(1);
 expect(screen.queryByRole("link",{name:"Member dashboard"})).toBeNull();
});
beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("opens labelled modal, restores focus and preserves a draft when closed",()=>{
 render(<AppDialog title="Register a document" trigger="Register"><input aria-label="Document title"/></AppDialog>);
 const opener=screen.getByRole("button",{name:"Register"});fireEvent.click(opener);
 expect(screen.getByRole("dialog",{name:"Register a document"})).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Document title"),{target:{value:"Draft"}});
 expect(document.body.style.overflow).toBe("hidden");
 fireEvent.click(screen.getByRole("button",{name:"Close register a document"}));
 expect(document.activeElement).toBe(opener);expect(document.body.style.overflow).toBe("");
 fireEvent.click(opener);expect((screen.getByLabelText("Document title") as HTMLInputElement).value).toBe("Draft");
});
it("dismisses account details on Escape and outside pointer interaction",()=>{
 const {container}=render(<AccountMenu email="user@example.test" initialRoleLabel="Engineer"/>);
 const details=container.querySelector("details")!;details.open=true;
 fireEvent.keyDown(details,{key:"Escape"});expect(details.open).toBe(false);expect(document.activeElement).toBe(container.querySelector("summary"));
 details.open=true;fireEvent.pointerDown(document.body);expect(details.open).toBe(false);
});
it("mobile workspace closes on Escape and outside interaction",async()=>{
 render(<WorkspaceNavigation/>);
 const toggle=screen.getByRole("button",{name:"Toggle workspace navigation"});
 fireEvent.click(toggle);expect(screen.getByRole("navigation",{name:"Mobile workspace"})).toBeTruthy();
 await act(async()=>{fireEvent.keyDown(document,{key:"Escape"});});expect(toggle.getAttribute("aria-expanded")).toBe("false");
 fireEvent.click(toggle);fireEvent.pointerDown(document.body);expect(toggle.getAttribute("aria-expanded")).toBe("false");
});
