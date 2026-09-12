import {act, cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {Session} from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({watch: vi.fn(), stop: vi.fn(), unsubscribe: vi.fn(), signOut: vi.fn(), observe: undefined as undefined | ((event: string, session: Session | null) => void)}));
vi.mock("@/lib/idle-session", () => ({watchIdleSession: mocks.watch}));
vi.mock("@/lib/supabase/browser", () => ({createClient: () => ({auth: {
  onAuthStateChange: (callback: typeof mocks.observe) => { mocks.observe = callback; return {data: {subscription: {unsubscribe: mocks.unsubscribe}}}; },
  signOut: mocks.signOut,
}})}));
import {IdleSessionGuard} from "./idle-session-guard";
const session = {access_token: `a.${btoa(JSON.stringify({session_id: "session-one"}))}.c`, user: {id: "user-one"}} as Session;
beforeEach(() => {vi.useFakeTimers(); vi.clearAllMocks(); mocks.watch.mockReturnValue(mocks.stop);});
afterEach(() => {cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();});
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
it("removes listeners and timers when unmounted", () => {
  const {unmount} = render(<IdleSessionGuard>Workspace</IdleSessionGuard>);
  act(() => mocks.observe?.("SIGNED_IN", session)); unmount();
  expect(mocks.stop).toHaveBeenCalledOnce(); expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
