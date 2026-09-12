import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {IDLE_TIMEOUT_MS, watchIdleSession} from "./idle-session";

let cleanup: (() => void) | undefined;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-12T12:00:00Z")); localStorage.clear(); });
afterEach(() => { cleanup?.(); vi.restoreAllMocks(); vi.useRealTimers(); });
it("expires at ten minutes, not before", () => {
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(IDLE_TIMEOUT_MS - 1); expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(expire).toHaveBeenCalledOnce();
});
it("does not restart the deadline after reload", () => {
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(9 * 60000); cleanup(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(60000); expect(expire).toHaveBeenCalledOnce();
});
it("ignores mouse movement and synthetic clicks", () => {
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(9 * 60000);
  document.dispatchEvent(new MouseEvent("mousemove")); document.dispatchEvent(new MouseEvent("click"));
  vi.advanceTimersByTime(60000); expect(expire).toHaveBeenCalledOnce();
});
it("resets on a trusted click", () => {
  const listeners = vi.spyOn(document, "addEventListener");
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(9 * 60000);
  const click = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
  click({isTrusted: true} as Event);
  vi.advanceTimersByTime(60000); expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(9 * 60000); expect(expire).toHaveBeenCalledOnce();
});
it("honours activity in another tab", () => {
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.advanceTimersByTime(9 * 60000); localStorage.setItem("session", String(Date.now()));
  window.dispatchEvent(new StorageEvent("storage", {key: "session"}));
  vi.advanceTimersByTime(60000); expect(expire).not.toHaveBeenCalled();
  vi.advanceTimersByTime(9 * 60000); expect(expire).toHaveBeenCalledOnce();
});
it("expires immediately when resuming a suspended tab", () => {
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS + 1);
  window.dispatchEvent(new Event("pageshow")); expect(expire).toHaveBeenCalledOnce();
});
it("blocks a late click instead of reviving an expired session", () => {
  const listeners = vi.spyOn(document, "addEventListener");
  const expire = vi.fn(); cleanup = watchIdleSession("session", expire);
  vi.setSystemTime(Date.now() + IDLE_TIMEOUT_MS);
  const click = listeners.mock.calls.find(([type]) => type === "click")![1] as EventListener;
  const event = {isTrusted: true, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn()};
  click(event as unknown as Event);
  expect(expire).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalled();
});
