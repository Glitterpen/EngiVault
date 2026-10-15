import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ProjectProgressRefresh} from "./project-progress-refresh";
import {watchIdleSession,IDLE_TIMEOUT_MS} from "@/lib/idle-session";

const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
const router={refresh};
vi.mock("next/navigation",()=>({useRouter:()=>router}));
let stopIdle:(()=>void)|undefined;
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));refresh.mockClear();localStorage.clear();Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});Object.defineProperty(navigator,"onLine",{configurable:true,value:true});});
afterEach(()=>{stopIdle?.();stopIdle=undefined;cleanup();vi.restoreAllMocks();vi.useRealTimers();});
const tick=async(ms:number)=>{await act(async()=>{vi.advanceTimersByTime(ms);});};

it("refreshes once per minute without a request on initial render",async()=>{
  render(<ProjectProgressRefresh asOf="2026-10-15T12:00:00Z"/>);
  expect(refresh).not.toHaveBeenCalled();await tick(59999);expect(refresh).not.toHaveBeenCalled();await tick(1);expect(refresh).toHaveBeenCalledOnce();await tick(60000);expect(refresh).toHaveBeenCalledTimes(2);
});
it("has individually preview-safe refresh and checkbox controls with visible UTC time",()=>{
  render(<ProjectProgressRefresh asOf="2026-10-15T12:34:56Z"/>);
  expect(screen.getByRole("button",{name:"Refresh now"}).hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.getByRole("checkbox",{name:/Auto-refresh/}).hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.getByText("12:34 UTC").getAttribute("dateTime")).toBe("2026-10-15T12:34:56Z");
});
it("allows manual refresh and pausing automatic refresh",async()=>{
  render(<ProjectProgressRefresh asOf="2026-10-15T12:00:00Z"/>);
  await act(async()=>{fireEvent.click(screen.getByRole("button",{name:"Refresh now"}));});expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("checkbox",{name:/Auto-refresh/}));await tick(180000);expect(refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("checkbox",{name:/Auto-refresh/}));await tick(60000);expect(refresh).toHaveBeenCalledTimes(2);
});
it("does not refresh hidden/offline tabs and refreshes when made visible",async()=>{
  render(<ProjectProgressRefresh asOf="2026-10-15T12:00:00Z"/>);
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});await tick(120000);expect(refresh).not.toHaveBeenCalled();
  Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});Object.defineProperty(navigator,"onLine",{configurable:true,value:false});
  await tick(60000);expect(refresh).not.toHaveBeenCalled();
  Object.defineProperty(navigator,"onLine",{configurable:true,value:true});await act(async()=>{document.dispatchEvent(new Event("visibilitychange"));});expect(refresh).toHaveBeenCalledOnce();
});
it("cleans up its timer and does not multiply requests after a data refresh",async()=>{
  const view=render(<ProjectProgressRefresh asOf="2026-10-15T12:00:00Z"/>);
  view.rerender(<ProjectProgressRefresh asOf="2026-10-15T12:01:00Z"/>);expect(screen.getByText("12:01 UTC")).toBeTruthy();await tick(60000);expect(refresh).toHaveBeenCalledOnce();
  view.unmount();await tick(120000);expect(refresh).toHaveBeenCalledOnce();
});
it("never extends the ten-minute idle deadline through automatic data refresh",async()=>{
  const expired=vi.fn();stopIdle=watchIdleSession("progress-session",expired);
  const originalActivity=localStorage.getItem("progress-session");
  render(<ProjectProgressRefresh asOf="2026-10-15T12:00:00Z"/>);
  for(let minute=0;minute<9;minute++)await tick(60000);
  expect(expired).not.toHaveBeenCalled();expect(refresh).toHaveBeenCalledTimes(9);expect(localStorage.getItem("progress-session")).toBe(originalActivity);
  await tick(IDLE_TIMEOUT_MS-9*60000);expect(expired).toHaveBeenCalledOnce();expect(localStorage.getItem("progress-session")).toBe(originalActivity);
});
