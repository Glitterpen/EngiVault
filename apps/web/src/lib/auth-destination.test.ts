import { describe, expect, it } from "vitest";
import { safeAuthDestination } from "./auth-destination";

describe("safeAuthDestination", () => {
  it("preserves workspace destinations", () => {
    expect(safeAuthDestination("/app/example/projects/123")).toBe("/app/example/projects/123");
    expect(safeAuthDestination("/organisation/setup")).toBe("/organisation/setup");
  });

  it("preserves a valid one-time invitation path", () => {
    const token = "a".repeat(64);
    expect(safeAuthDestination(`/invite/${token}`)).toBe(`/invite/${token}`);
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
