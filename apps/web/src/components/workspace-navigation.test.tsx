import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {useEffect} from "react";
import Link from "next/link";
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
const chrome={brand:<Link href="/app">EngiCite home</Link>,account:<button type="button" aria-label="Open account details">AB</button>};
let mobile=true;

function ContentProbe({onMount}:{onMount:()=>void}){
  useEffect(()=>{onMount();},[onMount]);
  return <main id="workspace-content" tabIndex={-1}><label>Draft note<input name="draft-note" defaultValue=""/></label></main>;
}

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
  it("keeps a long project name readable through keyboard and touch help while using a compact identity",async()=>{
    const name="FEED FOR 44KM SAN BARTH TO SPM EXPORT PIPELINE PROJECT";
    route.pathname=`${base}/overview`;fetchContext.mockResolvedValue(response(context("project_admin",{project:{code:"NWC-2601",name}})));
    render(<WorkspaceNavigation/>);await flush();resize(true);
    const aside=desktop().closest("aside")!,projectName=within(aside).getByText(name),help=within(aside).getByRole("button",{name:"Full project name"});
    expect(projectName.className).toContain(styles.projectName);expect(projectName.getAttribute("title")).toBe(name);expect(projectName.textContent).toBe(name);
    expect(help.getAttribute("type")).toBe("button");expect(help.hasAttribute("data-preview-safe")).toBe(true);
    act(()=>{help.focus();});expect(screen.getByRole("tooltip").textContent).toBe(name);expect(help.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("tooltip")).toBeNull();expect(document.activeElement).toBe(help);
    resize(false);fireEvent.click(toggle());const dialog=screen.getByRole("dialog",{name:"Project navigation"}),mobileHelp=within(dialog).getByRole("button",{name:"Full project name"});
    fireEvent.click(mobileHelp);expect(screen.getByRole("tooltip").textContent).toBe(name);expect(within(dialog).getByText(name,{selector:"p"}).textContent).toBe(name);
    fireEvent.click(mobileHelp);expect(screen.queryByRole("tooltip")).toBeNull();expect(hrefs(within(dialog).getByRole("navigation",{name:"Mobile workspace"}))).toEqual(hrefs(desktop()));
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

describe("collapsible desktop project sidebar",()=>{
  it("starts expanded and exposes a reversible native toggle with a controlled navigation landmark",async()=>{
    await workspace();resize(true);const aside=screen.getByRole("complementary",{name:"Project sidebar"});
    const collapse=within(aside).getByRole("button",{name:"Collapse sidebar"});
    expect(aside.getAttribute("data-collapsed")).toBe("false");expect(collapse.tagName).toBe("BUTTON");expect(collapse.getAttribute("type")).toBe("button");
    expect(collapse.getAttribute("aria-expanded")).toBe("true");expect(collapse.getAttribute("aria-controls")).toBe(desktop().id);expect(desktop().id).not.toBe("");
    expect(collapse.hasAttribute("data-preview-safe")).toBe(true);collapse.focus();expect(document.activeElement).toBe(collapse);
    // A detail-zero click is the click generated by native keyboard activation.
    fireEvent.click(collapse,{detail:0});const expand=within(aside).getByRole("button",{name:"Expand sidebar"});
    expect(aside.getAttribute("data-collapsed")).toBe("true");expect(expand.getAttribute("aria-expanded")).toBe("false");expect(expand.getAttribute("aria-controls")).toBe(desktop().id);
    expect(expand.hasAttribute("data-preview-safe")).toBe(true);expect(document.activeElement).toBe(expand);expect(document.body.style.overflow).toBe("");
    fireEvent.click(expand);expect(aside.getAttribute("data-collapsed")).toBe("false");expect(within(aside).getByRole("button",{name:"Collapse sidebar"}).getAttribute("aria-expanded")).toBe("true");
  });
  it.each(["organisation_admin","project_admin","document_controller","engineer","viewer"])("preserves every %s destination, accessible link name and badge while collapsed",async role=>{
    await workspace(role,`${base}/${role==="engineer"?"assignments":role==="document_controller"?"reviews":role==="viewer"?"documents":"overview"}`,{unreadCount:7});resize(true);
    const before=within(desktop()).getAllByRole("link").map(link=>({href:link.getAttribute("href"),label:linkLabel(link),text:link.textContent,current:link.getAttribute("aria-current")}));
    fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));
    const after=within(desktop()).getAllByRole("link");expect(after).toHaveLength(before.length);
    for(const [index,link] of after.entries()){
      expect(link.getAttribute("href")).toBe(before[index].href);expect(link.getAttribute("aria-current")).toBe(before[index].current);expect(link.textContent).toBe(before[index].text);
      expect(within(desktop()).getByRole("link",{name:new RegExp(`^${before[index].label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`)})).toBe(link);
    }
    expect(linkAt(desktop(),"/app/notifications").textContent).toContain("7");
    if(role==="document_controller")expect(within(desktop()).getByRole("link",{name:/Reviews.*5 pending/})).toBeTruthy();
  });
  it("retains the user's collapsed preference across project page changes and live context refreshes",async()=>{
    const view=await workspace("project_admin",`${base}/overview`);resize(true);fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));
    route.pathname=`${base}/progress`;view.rerender(<WorkspaceNavigation/>);await flush();
    expect(screen.getByRole("complementary",{name:"Project sidebar"}).getAttribute("data-collapsed")).toBe("true");expect(screen.getByRole("button",{name:"Expand sidebar"})).toBeTruthy();
    expect(linkAt(desktop(),`${base}/progress`).getAttribute("aria-current")).toBe("page");
    fireEvent.focus(window);await flush();expect(screen.getByRole("complementary",{name:"Project sidebar"}).getAttribute("data-collapsed")).toBe("true");
    fireEvent.click(screen.getByRole("button",{name:"Expand sidebar"}));route.pathname=`${base}/team`;view.rerender(<WorkspaceNavigation/>);await flush();
    expect(screen.getByRole("complementary",{name:"Project sidebar"}).getAttribute("data-collapsed")).toBe("false");
  });
  it("keeps audited preview collapse controls safe and never adds administrator tools",async()=>{
    route.pathname=`${base}/assignments`;fetchContext.mockResolvedValue(response(context("engineer",{preview:true,roleLabel:"Electrical Engineer"})));
    render(<WorkspaceNavigation previewScope={{organisationId,projectId,role:"engineer",disciplines:["Electrical"]}}/>);await flush();resize(true);
    const expected=hrefs(desktop()),collapse=screen.getByRole("button",{name:"Collapse sidebar"});expect(collapse.hasAttribute("data-preview-safe")).toBe(true);fireEvent.click(collapse);
    expect(hrefs(desktop())).toEqual(expected);expect(hrefs(desktop())).not.toContain(`${base}/administration`);expect(hrefs(desktop())).not.toContain(`${base}/settings`);
    expect(screen.getByRole("button",{name:"Expand sidebar"}).hasAttribute("data-preview-safe")).toBe(true);
  });
  it("keeps mobile navigation fully labelled and independent from the desktop collapse state",async()=>{
    await workspace("document_controller",`${base}/reviews`,{unreadCount:7});resize(true);const expected=hrefs(desktop());fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));resize(false);
    fireEvent.click(toggle());const dialog=screen.getByRole("dialog",{name:"Project navigation"}),nav=within(dialog).getByRole("navigation",{name:"Mobile workspace"});
    expect(hrefs(nav)).toEqual(expected);expect(within(nav).getByRole("link",{name:/Reviews.*5 pending/})).toBeTruthy();expect(within(nav).getByText("Reviews").className).toContain(styles.linkLabel);
    expect(within(dialog).queryByRole("button",{name:/^(Collapse|Expand) sidebar$/})).toBeNull();expect(within(dialog).getByText("Daily work")).toBeTruthy();expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.body.style.overflow).toBe("");
    resize(true);expect(screen.getByRole("complementary",{name:"Project sidebar"}).getAttribute("data-collapsed")).toBe("true");expect(screen.getByRole("button",{name:"Expand sidebar"})).toBeTruthy();
  });
  it("shows collapsed link labels on hover and keyboard focus, and dismisses them with Escape",async()=>{
    await workspace();resize(true);fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));const link=linkAt(desktop(),`${base}/documents`);
    fireEvent.mouseEnter(link);let tip=screen.getByRole("tooltip");expect(tip.textContent).toBe("MDR");expect(link.getAttribute("aria-describedby")).toBe(tip.id);
    fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("tooltip")).toBeNull();expect(link.hasAttribute("aria-describedby")).toBe(false);
    act(()=>{link.focus();});tip=screen.getByRole("tooltip");expect(tip.textContent).toBe("MDR");expect(document.activeElement).toBe(link);
    fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("tooltip")).toBeNull();expect(document.activeElement).toBe(link);
  });
  it("keeps a collapsed label visible while moving the pointer into its tooltip, then closes after leaving both",async()=>{
    vi.useFakeTimers();await workspace();resize(true);fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));const link=linkAt(desktop(),`${base}/documents`);
    fireEvent.mouseEnter(link);fireEvent.mouseLeave(link);act(()=>{vi.advanceTimersByTime(75);});
    fireEvent.mouseEnter(screen.getByRole("tooltip"));act(()=>{vi.advanceTimersByTime(200);});expect(screen.getByRole("tooltip").textContent).toBe("MDR");
    fireEvent.mouseLeave(screen.getByRole("tooltip"));act(()=>{vi.advanceTimersByTime(150);});expect(screen.queryByRole("tooltip")).toBeNull();expect(link.hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("unified workspace header",()=>{
  it("renders one contextual header and one mobile trigger without a second navigation bar",async()=>{
    const view=await workspace("project_admin",`${base}/overview`,{chrome});
    const header=screen.getByRole("banner"),location=within(header).getByRole("navigation",{name:"Current location"});
    expect(screen.getAllByRole("banner")).toHaveLength(1);expect(screen.getAllByRole("button",{name:"Toggle workspace navigation"})).toHaveLength(1);
    expect(within(header).getByRole("link",{name:"EngiCite home"}).getAttribute("href")).toBe("/app");expect(within(header).getByRole("button",{name:"Open account details"})).toBeTruthy();
    expect(location.textContent).toContain("BDR-FEED");expect(location.textContent).toContain("Overview");expect(view.container.querySelector(`.${styles.mobileBar}`)).toBeNull();
    expect(toggle().getAttribute("type")).toBe("button");expect(toggle().hasAttribute("data-preview-safe")).toBe(true);expect(toggle().getAttribute("aria-haspopup")).toBe("dialog");
  });
  it.each([
    ["document_controller",`${base}/documents/revision-id`,"MDR"],
    ["engineer",`${base}/assignments`,"Deliverables"],
    ["project_admin",`${base}/reports/weekly-report`,"Reports"],
  ])("uses the current authorised destination in the %s header",async(role,pathname,label)=>{
    await workspace(role,pathname,{chrome});const location=within(screen.getByRole("banner")).getByRole("navigation",{name:"Current location"});
    expect(location.textContent).toContain(label);expect(location.textContent).not.toContain(projectId);
    expect(within(desktop()).getAllByRole("link").filter(link=>link.getAttribute("aria-current")==="page")).toHaveLength(1);
  });
  it("caps the visual header badge without losing the full accessible unread count",async()=>{
    const view=await workspace("document_controller",`${base}/reviews`,{chrome,unreadCount:134});
    let link=within(screen.getByRole("banner")).getByRole("link",{name:"Notifications, 134 unread"});
    expect(link.getAttribute("href")).toBe("/app/notifications");expect(link.textContent).toContain("99+");expect(link.textContent).not.toContain("134");
    view.rerender(<WorkspaceNavigation chrome={chrome} unreadCount={0}/>);await flush();link=within(screen.getByRole("banner")).getByRole("link",{name:"Notifications, 0 unread"});
    expect(link.textContent).not.toMatch(/\d/);
  });
  it.each([response(null),response(context("owner",{project:{code:"PRIVATE",name:"Private administrator project"}})),response(context(),false)])("keeps unavailable or invalid header context generic %j",async value=>{
    fetchContext.mockResolvedValue(value);render(<WorkspaceNavigation chrome={chrome}/>);await flush();const header=screen.getByRole("banner");
    expect(header.textContent).toContain("Project workspace");expect(header.textContent).not.toContain("PRIVATE");expect(header.textContent).not.toContain("Badagry Refinery");expect(header.textContent).not.toContain("BDR-FEED");
    expect(hrefs(desktop()).sort()).toEqual(["/app",`/app/${organisationId}`,"/app/notifications"].sort());
  });
  it.each([
    context("organisation_admin",{preview:true,project:{code:"ACTOR-ADMIN",name:"Actor administrator project"}}),
    context("engineer",{preview:false,project:{code:"ACTOR-ADMIN",name:"Actor administrator project"}}),
  ])("never substitutes actor context into an audited member header %j",async value=>{
    route.pathname=`${base}/assignments`;fetchContext.mockResolvedValue(response(value));
    render(<WorkspaceNavigation chrome={chrome} previewScope={{organisationId,projectId,role:"engineer",disciplines:["Electrical"]}}/>);await flush();const header=screen.getByRole("banner");
    expect(header.textContent).toContain("Project workspace");expect(header.textContent).toContain("Deliverables");expect(header.textContent).not.toContain("ACTOR-ADMIN");expect(header.textContent).not.toContain("Actor administrator project");
    expect(hrefs(desktop())).toContain(`${base}/assignments`);expect(hrefs(desktop())).not.toContain(`${base}/administration`);expect(hrefs(desktop())).not.toContain(`${base}/overview`);
    expect(within(header).getByRole("link",{name:"Notifications, 0 unread"}).getAttribute("href")).toBe("/app/notifications");
  });
  it("clears the old project header immediately while a different project context is loading",async()=>{
    const next=deferred<ReturnType<typeof response>>();fetchContext.mockResolvedValueOnce(response(context("project_admin",{project:{code:"OLD-PROJECT",name:"Old confidential project"}}))).mockReturnValueOnce(next.promise);
    const view=render(<WorkspaceNavigation chrome={chrome}/>);await flush();expect(screen.getByRole("banner").textContent).toContain("OLD-PROJECT");
    route.pathname=`/app/${otherOrganisation}/projects/${otherProject}/overview`;view.rerender(<WorkspaceNavigation chrome={chrome}/>);await flush();
    expect(screen.getByRole("banner").textContent).toContain("Project workspace");expect(screen.getByRole("banner").textContent).not.toContain("OLD-PROJECT");
    await act(async()=>{next.resolve(response(context("project_admin",{project:{code:"NEW-PROJECT",name:"Current project"}})));});await flush();
    expect(screen.getByRole("banner").textContent).toContain("NEW-PROJECT");expect(screen.getByRole("banner").textContent).not.toContain("OLD-PROJECT");
  });
  it("keeps the main content mounted once across header refreshes, route changes and navigation controls",async()=>{
    const mounted=vi.fn(),content=<ContentProbe onMount={mounted}/>;route.pathname=`${base}/overview`;fetchContext.mockResolvedValue(response(context("project_admin")));
    const view=render(<WorkspaceNavigation chrome={chrome}>{content}</WorkspaceNavigation>);await flush();resize(true);
    const input=screen.getByRole("textbox",{name:"Draft note"}) as HTMLInputElement;fireEvent.change(input,{target:{value:"Keep this unsaved note"}});
    const assertContent=()=>{expect(screen.getByRole("textbox",{name:"Draft note"})).toBe(input);expect(input.value).toBe("Keep this unsaved note");expect(mounted).toHaveBeenCalledTimes(1);expect(view.container.querySelectorAll("#workspace-content")).toHaveLength(1);expect(screen.getAllByRole("main")).toHaveLength(1);};
    fireEvent.click(screen.getByRole("button",{name:"Collapse sidebar"}));assertContent();
    route.pathname=`${base}/progress`;view.rerender(<WorkspaceNavigation chrome={chrome}>{content}</WorkspaceNavigation>);await flush();assertContent();
    expect(screen.getByRole("complementary",{name:"Project sidebar"}).getAttribute("data-collapsed")).toBe("true");expect(within(screen.getByRole("banner")).getByRole("navigation",{name:"Current location"}).textContent).toContain("Progress & health");
    fireEvent.focus(window);await flush();assertContent();resize(false);document.body.style.overflow="clip";const opener=toggle();fireEvent.click(opener);
    const dialog=screen.getByRole("dialog",{name:"Project navigation"});expect(opener.getAttribute("aria-controls")).toBe(dialog.id);expect(dialog.contains(document.activeElement)).toBe(true);expect(document.body.style.overflow).toBe("hidden");assertContent();
    fireEvent.keyDown(document,{key:"Escape"});expect(screen.queryByRole("dialog",{name:"Project navigation"})).toBeNull();expect(document.activeElement).toBe(opener);expect(document.body.style.overflow).toBe("clip");assertContent();
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
