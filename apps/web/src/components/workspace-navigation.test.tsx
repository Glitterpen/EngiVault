import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {WorkspaceNavigation} from "./workspace-navigation";
import {roleLabel,workspacePersona} from "@/lib/role-experience";
import styles from "./workspace-navigation.module.css";

const route=vi.hoisted(()=>({pathname:""}));
const fetchContext=vi.hoisted(()=>vi.fn());
vi.mock("next/navigation",()=>({usePathname:()=>route.pathname}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name,organisationId,projectId}:{name:string;organisationId:string;projectId:string})=><span role="img" aria-label={`${name} logo`} data-organisation={organisationId} data-project={projectId}/> }));

const organisationId="fdd57c46-9041-4b30-9a09-82d353175251";
const projectId="6ffa3130-1a47-4c97-94e2-7044452efb6f";
const otherOrganisation="3b817944-967d-44ce-9f55-f350b21f405b";
const otherProject="84a284cf-a4af-44db-937e-911d8bdb7e0f";
const base=`/app/${organisationId}/projects/${projectId}`;
const endpoint=(org=organisationId,project=projectId)=>`/api/v1/organisations/${org}/projects/${project}/workspace-context`;
const mediaListeners=new Map<string,Set<(event:MediaQueryListEvent)=>void>>();
let mobile=true;

function context(role="document_controller",overrides:Record<string,unknown>={}){
  return {role,roleLabel:roleLabel(role),persona:workspacePersona(role),project:{code:"BDR-FEED",name:"Badagry Refinery"},pendingReviewCount:5,preview:false,...overrides};
}
function response(value:unknown,ok=true){return {ok,json:async()=>value};}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(finish=>{resolve=finish;});return {promise,resolve};}
async function flush(){await act(async()=>{for(let turn=0;turn<8;turn++)await Promise.resolve();});}
async function workspace(role="document_controller",pathname=`${base}/control`,props:Parameters<typeof WorkspaceNavigation>[0]={}){
  route.pathname=pathname;fetchContext.mockResolvedValue(response(context(role)));
  const view=render(<WorkspaceNavigation {...props}/>);await flush();return view;
}
function desktop(){return screen.getByRole("navigation",{name:"Workspace"});}
function toggle(){return screen.getByRole("button",{name:"Toggle workspace navigation"});}
function hrefs(nav:HTMLElement){return within(nav).getAllByRole("link").map(link=>link.getAttribute("href")!);}
function linkAt(nav:HTMLElement,href:string){const link=within(nav).getAllByRole("link").find(item=>item.getAttribute("href")===href);expect(link).toBeTruthy();return link!;}
function linkLabel(link:HTMLElement){return link.querySelector(`.${styles.linkLabel}`)?.textContent??"";}
function resize(desktopWidth:boolean){act(()=>{mobile=!desktopWidth;Object.defineProperty(window,"innerWidth",{configurable:true,value:desktopWidth?1024:390});for(const [query,listeners] of mediaListeners){const matches=query.includes("min-width")?!mobile:mobile;listeners.forEach(listener=>listener({matches,media:query} as MediaQueryListEvent));}window.dispatchEvent(new Event("resize"));});}

beforeEach(()=>{
  route.pathname=`${base}/control`;mobile=true;mediaListeners.clear();fetchContext.mockReset();fetchContext.mockResolvedValue(response(context()));
  Object.defineProperty(window,"innerWidth",{configurable:true,value:390});
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
  vi.stubGlobal("fetch",fetchContext);
  vi.stubGlobal("matchMedia",vi.fn((query:string)=>{
    const listeners=new Set<(event:MediaQueryListEvent)=>void>();mediaListeners.set(query,listeners);
    return {get matches(){return query.includes("min-width")?!mobile:mobile;},media:query,onchange:null,addEventListener:vi.fn((_event:string,listener:(event:MediaQueryListEvent)=>void)=>listeners.add(listener)),removeEventListener:vi.fn((_event:string,listener:(event:MediaQueryListEvent)=>void)=>listeners.delete(listener)),addListener:vi.fn((listener:(event:MediaQueryListEvent)=>void)=>listeners.add(listener)),removeListener:vi.fn((listener:(event:MediaQueryListEvent)=>void)=>listeners.delete(listener)),dispatchEvent:vi.fn()};
  }));
});
afterEach(()=>{
  for(const [url,options] of fetchContext.mock.calls){expect(url).toMatch(/\/workspace-context$/);expect(options?.method??"GET").toBe("GET");expect(options?.body).toBeUndefined();}
  cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();document.body.style.overflow="";
});

describe("role-scoped project workbench",()=>{
  it.each([
    ["organisation_admin",["overview","progress","reports","team","templates","interdisciplinary","administration"]],
    ["project_admin",["overview","progress","reports","team","templates","interdisciplinary","requests","settings"]],
    ["document_controller",["control","documents","reviews","requests","templates","interdisciplinary","team","progress","work-packages"]],
    ["engineer",["assignments","requests","templates","interdisciplinary","search","chat"]],
    ["viewer",["documents","search","templates","interdisciplinary"]],
  ] as const)("preserves the exact authorised links for %s without adding other-role tools",async(role,paths)=>{
    await workspace(role);const links=hrefs(desktop());
    const expected=["/app",`/app/${organisationId}`,"/app/notifications",...paths.map(path=>`${base}/${path}`)];
    expect([...links].sort()).toEqual([...expected].sort());expect(new Set(links).size).toBe(links.length);
    expect(within(desktop().closest("aside")!).getByText(roleLabel(role))).toBeTruthy();
    for(const link of within(desktop()).getAllByRole("link")){expect(link.className).toContain(styles.link);expect(link.querySelector("[aria-hidden='true']")).toBeTruthy();}
  });
  it("groups everyday work and project tools without mixing workspace switches into the daily task list",async()=>{
    await workspace("project_admin");
    expect(within(desktop()).getByText("Daily work")).toBeTruthy();expect(within(desktop()).getByText("Project tools")).toBeTruthy();expect(within(desktop()).getByText("Administration")).toBeTruthy();
    expect(within(desktop()).queryByRole("link",{name:"Member dashboard"})).toBeNull();
  });
  it.each([
    ["document_controller",`${base}/documents/5acda80c-bb35-4e70-a2e8-cf9bf4c9aa02`,`${base}/documents`],
    ["project_admin",`${base}/reports/weekly-report`,`${base}/reports`],
    ["engineer",`${base}/interdisciplinary/revision-id`,`${base}/interdisciplinary`],
  ])("marks exactly one current destination for a nested %s route",async(role,pathname,href)=>{
    await workspace(role,pathname);const nav=desktop(),current=within(nav).getAllByRole("link").filter(link=>link.getAttribute("aria-current")==="page");
    expect(current).toHaveLength(1);expect(current[0].getAttribute("href")).toBe(href);expect(toggle().textContent).toContain(linkLabel(current[0]));
  });
  it.each(["engineer","document_controller","project_admin"])("keeps %s audited preview scoped with one role-home link",async role=>{
    fetchContext.mockReturnValue(new Promise(()=>{}));route.pathname="/app";
    render(<WorkspaceNavigation previewScope={{organisationId,projectId,role,disciplines:["Electrical","Instrumentation"]}}/>);await flush();
    const links=hrefs(desktop()),home=`${base}/${role==="engineer"?"assignments":role==="document_controller"?"control":"overview"}`;
    expect(links.filter(href=>href===home)).toHaveLength(1);expect(links).not.toContain("/app");expect(links).not.toContain(`/app/${organisationId}`);
    expect(within(desktop()).queryByRole("link",{name:"Member dashboard"})).toBeNull();expect(within(desktop().closest("aside")!).getByText("Read-only preview")).toBeTruthy();
  });
  it("shows project identity with the readable role, and summarises the current page on mobile",async()=>{
    await workspace("document_controller",`${base}/reviews`);const aside=desktop().closest("aside")!;
    expect(within(aside).getByText("BDR-FEED")).toBeTruthy();expect(within(aside).getByText("Badagry Refinery")).toBeTruthy();expect(within(aside).getByText("Document Controller")).toBeTruthy();
    expect(toggle().textContent).toContain("BDR-FEED");expect(toggle().textContent).toContain(linkLabel(linkAt(desktop(),`${base}/reviews`)));
    const logo=within(aside).getByRole("img",{hidden:true});expect(logo.getAttribute("data-organisation")).toBe(organisationId);expect(logo.getAttribute("data-project")).toBe(projectId);expect(logo.closest('[aria-hidden="true"]')).toBeTruthy();
  });
  it("retains unread and pending-review counts without a zero badge or unbounded badge text",async()=>{
    route.pathname=`${base}/reviews`;fetchContext.mockResolvedValue(response(context("document_controller",{pendingReviewCount:123})));
    const view=render(<WorkspaceNavigation unreadCount={134}/>);await flush();
    expect(linkAt(desktop(),`${base}/reviews`).textContent).toContain("99+");expect(linkAt(desktop(),"/app/notifications").textContent).toContain("99+");
    fetchContext.mockResolvedValue(response(context("document_controller",{pendingReviewCount:0})));fireEvent.focus(window);await flush();view.rerender(<WorkspaceNavigation unreadCount={0}/>);
    expect(linkAt(desktop(),`${base}/reviews`).textContent).not.toMatch(/\d/);expect(linkAt(desktop(),"/app/notifications").textContent).not.toMatch(/\d/);
  });
});

describe("safe project-context lifecycle",()=>{
  it("does not expose operational tools while context is unavailable",async()=>{
    fetchContext.mockReturnValue(new Promise(()=>{}));render(<WorkspaceNavigation/>);await flush();
    expect(hrefs(desktop()).sort()).toEqual(["/app",`/app/${organisationId}`,"/app/notifications"].sort());expect(screen.queryByText("Badagry Refinery")).toBeNull();
    expect(fetchContext).toHaveBeenCalledWith(endpoint(),expect.objectContaining({cache:"no-store",signal:expect.any(AbortSignal)}));
  });
  it.each([response(null),response({role:"owner",persona:"management"}),response(context(),false)])("fails closed for unavailable or invalid context %j",async value=>{
    fetchContext.mockResolvedValue(value);render(<WorkspaceNavigation/>);await flush();
    expect(hrefs(desktop()).sort()).toEqual(["/app",`/app/${organisationId}`,"/app/notifications"].sort());expect(screen.queryByText("Document Controller")).toBeNull();
  });
  it("ignores transport diagnostics rather than showing them in the sidebar",async()=>{
    fetchContext.mockRejectedValue(new Error("TOP_SECRET provider failure"));const view=render(<WorkspaceNavigation/>);await flush();
    expect(view.container.textContent).not.toContain("TOP_SECRET");expect(hrefs(desktop())).not.toContain(`${base}/control`);
  });
  it("clears a previously loaded context if the same-scope refresh fails",async()=>{
    await workspace("document_controller");expect(hrefs(desktop())).toContain(`${base}/reviews`);
    fetchContext.mockResolvedValue(response(null,false));fireEvent.focus(window);await flush();
    expect(hrefs(desktop()).sort()).toEqual(["/app",`/app/${organisationId}`,"/app/notifications"].sort());expect(screen.queryByText("Badagry Refinery")).toBeNull();
  });
  it.each([
    context("organisation_admin",{preview:true}),
    context("engineer",{preview:false}),
  ])("keeps the trusted audited role rather than accepting conflicting preview context %j",async value=>{
    fetchContext.mockResolvedValue(response(value));route.pathname=`${base}/assignments`;
    render(<WorkspaceNavigation previewScope={{organisationId,projectId,role:"engineer",disciplines:["Electrical"]}}/>);await flush();
    const links=hrefs(desktop());expect(links).toContain(`${base}/assignments`);expect(links).not.toContain(`${base}/administration`);expect(links).not.toContain(`${base}/overview`);expect(links).not.toContain("/app");expect(links).not.toContain(`/app/${organisationId}`);
    expect(within(desktop().closest("aside")!).getByText("Electrical Engineer")).toBeTruthy();
  });
  it("pins audited preview organisation and project to trusted preview props even when the pathname differs",async()=>{
    route.pathname=`/app/${otherOrganisation}/projects/${otherProject}/assignments`;
    fetchContext.mockResolvedValue(response(context("engineer",{preview:true,roleLabel:"Electrical Engineer"})));
    render(<WorkspaceNavigation previewScope={{organisationId,projectId,role:"engineer",disciplines:["Electrical"]}}/>);await flush();
    expect(fetchContext).toHaveBeenCalledWith(endpoint(),expect.objectContaining({cache:"no-store",signal:expect.any(AbortSignal)}));
    expect(fetchContext.mock.calls.every(([url])=>url===endpoint())).toBe(true);
    const links=hrefs(desktop());expect(links).toContain(`${base}/assignments`);expect(links.every(href=>href==="/app/notifications"||href.startsWith(`${base}/`))).toBe(true);
    expect(links.some(href=>href.includes(otherOrganisation)||href.includes(otherProject))).toBe(false);
    const logo=within(desktop().closest("aside")!).getByRole("img",{hidden:true});expect(logo.getAttribute("data-organisation")).toBe(organisationId);expect(logo.getAttribute("data-project")).toBe(projectId);
  });
  it.each([
    [organisationId,otherProject],
    [otherOrganisation,projectId],
  ])("does not show a stale old context after switching to %s / %s",async(nextOrg,nextProject)=>{
    const old=deferred<ReturnType<typeof response>>(),next=deferred<ReturnType<typeof response>>();fetchContext.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const view=render(<WorkspaceNavigation/>);await flush();const oldSignal=fetchContext.mock.calls[0][1].signal as AbortSignal;
    route.pathname=`/app/${nextOrg}/projects/${nextProject}/overview`;view.rerender(<WorkspaceNavigation/>);await flush();expect(oldSignal.aborted).toBe(true);
    await act(async()=>{old.resolve(response(context("organisation_admin",{project:{code:"OLD",name:"Old confidential project"}})));});await flush();
    expect(view.container.textContent).not.toContain("Old confidential project");expect(hrefs(desktop())).not.toContain(`${base}/administration`);
    await act(async()=>{next.resolve(response(context("engineer",{project:{code:"NEW",name:"Current project"}})));});await flush();
    expect(view.container.textContent).toContain("Current project");expect(hrefs(desktop())).toContain(`/app/${nextOrg}/projects/${nextProject}/assignments`);
    expect(fetchContext.mock.calls[1][0]).toBe(endpoint(nextOrg,nextProject));
  });
  it("refreshes scoped GET context on focus and interval, then aborts and clears polling on unmount",async()=>{
    vi.useFakeTimers();const view=render(<WorkspaceNavigation/>);await flush();expect(fetchContext).toHaveBeenCalledTimes(1);
    fireEvent.focus(window);await flush();expect(fetchContext).toHaveBeenCalledTimes(2);
    await act(async()=>{vi.advanceTimersByTime(15000);});await flush();expect(fetchContext).toHaveBeenCalledTimes(3);
    const signal=fetchContext.mock.calls.at(-1)![1].signal as AbortSignal;view.unmount();expect(signal.aborted).toBe(true);
    fireEvent.focus(window);await act(async()=>{vi.advanceTimersByTime(30000);});expect(fetchContext).toHaveBeenCalledTimes(3);
  });
});

describe("mobile project navigation dialog",()=>{
  it("opens a labelled modal with identical scoped links, focus containment and reversible body locking",async()=>{
    await workspace();const expected=hrefs(desktop());document.body.style.overflow="clip";const opener=toggle();opener.focus();fireEvent.click(opener);
    const dialog=screen.getByRole("dialog",{name:"Project navigation"});expect(dialog.getAttribute("aria-modal")).toBe("true");expect(opener.getAttribute("aria-expanded")).toBe("true");expect(opener.getAttribute("aria-controls")).toBe(dialog.id);
    const nav=within(dialog).getByRole("navigation",{name:"Mobile workspace"});expect(hrefs(nav)).toEqual(expected);expect(dialog.contains(document.activeElement)).toBe(true);expect(document.body.style.overflow).toBe("hidden");
    const focusable=[...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')].filter(element=>!element.hasAttribute("hidden"));
    expect(focusable.length).toBeGreaterThan(1);focusable.at(-1)!.focus();fireEvent.keyDown(document,{key:"Tab"});expect(document.activeElement).toBe(focusable[0]);
    focusable[0].focus();fireEvent.keyDown(document,{key:"Tab",shiftKey:true});expect(document.activeElement).toBe(focusable.at(-1));
    // Leaving the final HelpTip closes its nested tooltip before testing the drawer.
    act(()=>{focusable[0].focus();});fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.activeElement).toBe(opener);expect(document.body.style.overflow).toBe("clip");
  });
  it("closes on an outside interaction and restores trigger focus",async()=>{
    await workspace();const opener=toggle();fireEvent.click(opener);fireEvent.pointerDown(document.body);await flush();
    expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.activeElement).toBe(opener);expect(opener.getAttribute("aria-expanded")).toBe("false");
  });
  it("closes on selecting a destination without submitting a form or mutating data",async()=>{
    const view=await workspace();fireEvent.click(toggle());const dialog=screen.getByRole("dialog",{name:"Project navigation"});
    const destination=linkAt(within(dialog).getByRole("navigation",{name:"Mobile workspace"}),`${base}/reviews`);destination.addEventListener("click",event=>event.preventDefault(),{once:true});fireEvent.click(destination);
    expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(view.container.querySelector("form")).toBeNull();
    for(const button of view.container.querySelectorAll("button"))expect(button.type).toBe("button");
  });
  it("closes after a route change even without clicking one of its links",async()=>{
    const view=await workspace();fireEvent.click(toggle());route.pathname=`${base}/reviews`;view.rerender(<WorkspaceNavigation/>);await flush();
    expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.body.style.overflow).toBe("");expect(toggle().textContent).toContain(linkLabel(linkAt(desktop(),`${base}/reviews`)));
  });
  it("closes when switching to desktop and releases scroll and focus subscriptions",async()=>{
    const view=await workspace();fireEvent.click(toggle());resize(true);await flush();expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.body.style.overflow).toBe("");
    view.unmount();expect([...mediaListeners.values()].every(listeners=>listeners.size===0)).toBe(true);
  });
  it("restores the previous scroll style if the component unmounts with its drawer open",async()=>{
    const view=await workspace();document.body.style.overflow="clip";fireEvent.click(toggle());expect(document.body.style.overflow).toBe("hidden");view.unmount();expect(document.body.style.overflow).toBe("clip");
  });
});
