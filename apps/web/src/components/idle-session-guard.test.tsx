import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {Session} from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({watch: vi.fn(), stop: vi.fn(), unsubscribe: vi.fn(), signOut: vi.fn(), observe: undefined as undefined | ((event: string, session: Session | null) => void)}));
vi.mock("@/lib/idle-session", () => ({watchIdleSession: mocks.watch}));
vi.mock("@/lib/protected-route",async importOriginal=>{
  const original=await importOriginal<typeof import("@/lib/protected-route")>();
  return {...original,protectedSignInUrl:vi.fn(original.protectedSignInUrl)};
});
vi.mock("@/lib/supabase/browser", () => ({createClient: () => ({auth: {
  onAuthStateChange: (callback: typeof mocks.observe) => { mocks.observe = callback; return {data: {subscription: {unsubscribe: mocks.unsubscribe}}}; },
  signOut: mocks.signOut,
}})}));
import {IdleSessionGuard} from "./idle-session-guard";
import {protectedSignInUrl} from "@/lib/protected-route";
const session = {access_token: `a.${btoa(JSON.stringify({session_id: "session-one"}))}.c`, user: {id: "user-one"}} as Session;
beforeEach(() => {vi.useFakeTimers(); vi.clearAllMocks(); mocks.watch.mockReturnValue(mocks.stop);window.history.replaceState(null,"","/");});
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();window.history.replaceState(null,"","/");});
it("starts only for signed-in sessions and does not restart on token refresh", () => {
  render(<IdleSessionGuard>Workspace</IdleSessionGuard>);
  act(() => mocks.observe?.("INITIAL_SESSION", null)); expect(mocks.watch).not.toHaveBeenCalled();
  act(() => mocks.observe?.("SIGNED_IN", session));
  act(() => mocks.observe?.("TOKEN_REFRESHED", {...session, expires_at: 123}));
  expect(mocks.watch).toHaveBeenCalledTimes(1);
  expect(mocks.watch.mock.calls[0][0]).toBe("engicite:idle:user-one:session-one");
});
it("hides the workspace and retries failed logout without unlocking", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetchMock);
  render(<IdleSessionGuard>Private documents</IdleSessionGuard>);
  act(() => mocks.observe?.("SIGNED_IN", session));
  act(() => mocks.watch.mock.calls[0][1]());
  expect(screen.queryByText("Private documents")).toBeNull();
  expect(screen.getByRole("heading", {name: "Session locked"})).toBeTruthy();
  await act(async () => {await vi.advanceTimersByTimeAsync(0);});
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {await vi.advanceTimersByTimeAsync(5000);});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Private documents")).toBeNull();
});
it.each(["/app/org/projects/project/documents?view=grouped&q=Design%20basis","/founder/deleted?q=Example"])("captures the current path and query for secure idle recovery from %s",path=>{
  window.history.replaceState(null,"",path);
  render(<IdleSessionGuard>Private documents</IdleSessionGuard>);
  act(()=>mocks.observe?.("SIGNED_IN",session));
  act(()=>mocks.watch.mock.calls[0][1]());
  const current=new URL(window.location.href);
  expect(protectedSignInUrl).toHaveBeenCalledWith(current.pathname,current.search,"expired");
  const destination=vi.mocked(protectedSignInUrl).mock.results[0].value as string;
  const signIn=new URL(destination,window.location.origin);
  expect(signIn.searchParams.get("next")).toBe(current.pathname+current.search);
  expect(signIn.pathname).toBe(path.startsWith("/founder")?"/founder-access":"/login");
  expect(screen.queryByText("Private documents")).toBeNull();
  expect(screen.getByRole("heading",{name:"Session locked"})).toBeTruthy();
});
it("removes listeners and timers when unmounted", () => {
  const {unmount} = render(<IdleSessionGuard>Workspace</IdleSessionGuard>);
  act(() => mocks.observe?.("SIGNED_IN", session)); unmount();
  expect(mocks.stop).toHaveBeenCalledOnce(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("shows a non-blocking accessible warning without signing out or recording artificial activity", () => {
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  render(<IdleSessionGuard>Private documents</IdleSessionGuard>);
  act(() => mocks.observe?.("SIGNED_IN", session));
  const warn = mocks.watch.mock.calls[0][2] as (seconds: number | null) => void;
  act(() => warn(60));
  expect(screen.getByText("Private documents")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Your session will end within a minute due to inactivity.");
  expect(screen.getByRole("complementary", {name: "Inactivity warning"})).toBeTruthy();
  expect(screen.getByText("60s remaining").getAttribute("aria-hidden")).toBe("true");
  fireEvent.click(screen.getByRole("button", {name: "Continue working"}));
  expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.watch).toHaveBeenCalledOnce();
  act(() => warn(59)); expect(screen.getByText("59s remaining")).toBeTruthy();
  act(() => warn(null)); expect(screen.queryByRole("complementary", {name: "Inactivity warning"})).toBeNull();
});
it("clears an old warning when the session identity changes and ignores callbacks after expiry", () => {
  render(<IdleSessionGuard>Workspace</IdleSessionGuard>);
  act(() => mocks.observe?.("SIGNED_IN", session));
  const warn = mocks.watch.mock.calls[0][2] as (seconds: number | null) => void;
  act(() => warn(15));
  act(() => mocks.observe?.("SIGNED_IN", {...session, access_token: `a.${btoa(JSON.stringify({session_id: "session-two"}))}.c`}));
  expect(screen.queryByRole("complementary", {name: "Inactivity warning"})).toBeNull();
  act(() => mocks.watch.mock.calls[1][1]()); act(() => warn(10));
  expect(screen.getByRole("heading", {name: "Session locked"})).toBeTruthy();
  expect(screen.queryByRole("complementary", {name: "Inactivity warning"})).toBeNull();
});
