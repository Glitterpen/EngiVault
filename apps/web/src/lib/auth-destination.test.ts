import { describe, expect, it } from "vitest";
import { safeAuthDestination } from "./auth-destination";

describe("safeAuthDestination", () => {
  it("preserves workspace destinations", () => {
    expect(safeAuthDestination("/app/example/projects/123")).toBe("/app/example/projects/123");
    expect(safeAuthDestination("/organisation/setup")).toBe("/organisation/setup");
    expect(safeAuthDestination("/founder")).toBe("/founder");
    expect(safeAuthDestination("/founder/deleted")).toBe("/founder/deleted");
  });

  it("preserves a valid one-time invitation path", () => {
    const token = "a".repeat(64);
    expect(safeAuthDestination(`/invite/${token}`)).toBe(`/invite/${token}`);
  });

  it("preserves a password-recovery route with a safe invitation return", () => {
    const token = "b".repeat(64);
    expect(safeAuthDestination(`/auth/update-password?next=${encodeURIComponent(`/invite/${token}`)}`))
      .toBe(`/auth/update-password?next=${encodeURIComponent(`/invite/${token}`)}`);
  });

  it("removes an unsafe password-recovery return destination", () => {
    expect(safeAuthDestination("/auth/update-password?next=https%3A%2F%2Fattacker.example"))
      .toBe("/auth/update-password?next=%2Fapp");
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/invite/not-a-token",
    "/login",
    "/app\\redirect",
  ])("rejects unsafe or unsupported destination %s", (destination) => {
    expect(safeAuthDestination(destination)).toBe("/app");
  });
});
