import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {AccountMenu} from "./account-menu";

const navigation=vi.hoisted(()=>({pathname:"/app"}));
vi.mock("next/navigation",()=>({usePathname:()=>navigation.pathname}));
vi.mock("@/app/(auth)/actions",()=>({signOut:vi.fn()}));

beforeEach(()=>{
  navigation.pathname="/app";
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,json:async()=>null})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it("keeps a labelled native account disclosure with a 44px target and decorative avatar",()=>{
  const {container}=render(<AccountMenu email="engineer@example.test" initialRoleLabel="Engineer"/>);
  const trigger=screen.getByLabelText("Open account details, Engineer");
  expect(trigger.tagName).toBe("SUMMARY");
  expect(trigger.className).toContain("min-h-11");
  expect(trigger.querySelector('[aria-hidden="true"]')?.textContent).toBe("E");
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.querySelector(".ev-account-role")?.textContent).toBe("Engineer");
});

it("keeps email, role and sign out in the expanded account panel",()=>{
  const {container}=render(<AccountMenu email="engineer@example.test" initialRoleLabel="Engineer"/>);
  container.querySelector("details")!.open=true;
  expect(screen.getByText("engineer@example.test")).toBeTruthy();
  expect(screen.getByRole("button",{name:"Sign out"}).closest("form")).toBeTruthy();
  expect(screen.queryByRole("link",{name:"Founder control centre"})).toBeNull();
});

it("retains the founder link only when founder access is authorised",()=>{
  const {container}=render(<AccountMenu email="founder@example.test" initialRoleLabel="Organisation Administrator" founderAccess/>);
  container.querySelector("details")!.open=true;
  const founderLink=screen.getByRole("link",{name:"Founder control centre"});
  expect(founderLink.getAttribute("href")).toBe("/founder");
  expect(founderLink.className).toContain("min-h-11");
});

it("closes on Escape, outside pointer interaction and leaving the disclosure",()=>{
  const {container}=render(<AccountMenu email="user@example.test" initialRoleLabel="Engineer"/>);
  const details=container.querySelector("details")!;
  const summary=container.querySelector("summary")!;
  details.open=true;
  fireEvent.keyDown(details,{key:"Escape"});
  expect(details.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  details.open=true;
  fireEvent.pointerDown(document.body);
  expect(details.open).toBe(false);
  details.open=true;
  fireEvent.blur(details,{relatedTarget:document.body});
  expect(details.open).toBe(false);
});

it("closes the account panel when the user navigates to another page",()=>{
  const props={email:"user@example.test",initialRoleLabel:"Engineer"};
  const {container,rerender}=render(<AccountMenu {...props}/>);
  container.querySelector("details")!.open=true;
  navigation.pathname="/app/notifications";
  rerender(<AccountMenu {...props}/>);
  expect(container.querySelector("details")!.open).toBe(false);
});

it("continues to display the current project role returned by the workspace context",async()=>{
  navigation.pathname="/app/fdd57c46-9041-4b30-9a09-82d353175251/projects/6ffa3130-1a47-4c97-94e2-7044452efb6f/overview";
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({roleLabel:"Project Manager"})})));
  render(<AccountMenu email="user@example.test" initialRoleLabel="Engineer"/>);
  await waitFor(()=>expect(screen.getByLabelText("Open account details, Project Manager")).toBeTruthy());
});
