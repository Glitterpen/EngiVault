import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadConfig(vercel: string | undefined) {
  vi.stubEnv("VERCEL", vercel);
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  return (await import("../../next.config")).default;
}

describe("deployment packaging", () => {
  it("lets the hosting adapter package Vercel builds", async () => {
    expect((await loadConfig("1")).output).toBeUndefined();
  });

  it.each([undefined, "0"])("preserves standalone self-hosting when VERCEL=%s", async (vercel) => {
    expect((await loadConfig(vercel)).output).toBe("standalone");
  });

  it.each([undefined, "1"])("preserves production security headers when VERCEL=%s", async (vercel) => {
    const config = await loadConfig(vercel);
    expect(config.poweredByHeader).toBe(false);
    const rules = await config.headers!();
    const globalHeaders = rules.find((rule) => rule.source === "/:path*")!.headers;
    expect(globalHeaders).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(globalHeaders).toContainEqual({ key: "X-Content-Type-Options", value: "nosniff" });
    const csp = globalHeaders.find((header) => header.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    for (const source of ["/app/:path*", "/api/:path*", "/login"]) {
      expect(rules.find((rule) => rule.source === source)!.headers).toContainEqual({
        key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate",
      });
    }
  });
});
