import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({signOut: vi.fn(), deleteCookie: vi.fn()}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({auth: {signOut: mocks.signOut}})}));
vi.mock("next/headers", () => ({cookies: async () => ({delete: mocks.deleteCookie})}));
import {POST} from "./route";
beforeEach(() => {vi.clearAllMocks(); mocks.signOut.mockResolvedValue({error: null});});
it("revokes this browser session and clears preview state", async () => {
  const response = await POST(new Request("https://app.engicite.com/auth/idle-logout", {method: "POST", headers: {origin: "https://app.engicite.com"}}));
  expect(response.status).toBe(204); expect(mocks.signOut).toHaveBeenCalledWith({scope: "local"});
  expect(mocks.deleteCookie).toHaveBeenCalledWith("engicite_admin_preview");
});
it("rejects cross-origin logout", async () => {
  const response = await POST(new Request("https://app.engicite.com/auth/idle-logout", {method: "POST", headers: {origin: "https://other.test"}}));
  expect(response.status).toBe(403); expect(mocks.signOut).not.toHaveBeenCalled();
});
it("reports revocation failure so the locked client retries", async () => {
  mocks.signOut.mockResolvedValue({error: new Error("offline")});
  const response = await POST(new Request("https://app.engicite.com/auth/idle-logout", {method: "POST", headers: {origin: "https://app.engicite.com"}}));
  expect(response.status).toBe(503);
});
