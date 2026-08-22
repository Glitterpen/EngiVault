import { describe, expect, it } from "vitest";

import { resolveProcessorConfig } from "./processor";

describe("resolveProcessorConfig", () => {
  it("rejects a missing shared secret", () => {
    expect(() =>
      resolveProcessorConfig({
        NODE_ENV: "production",
        PROCESSOR_URL: "https://processor.example.com",
      }),
    ).toThrow("PROCESSOR_SHARED_SECRET_REQUIRED");
  });

  it("rejects the former development fallback", () => {
    expect(() =>
      resolveProcessorConfig({
        NODE_ENV: "development",
        PROCESSOR_SHARED_SECRET: "local-development-only",
      }),
    ).toThrow("PROCESSOR_SHARED_SECRET_REQUIRED");
  });

  it("requires HTTPS in production", () => {
    expect(() =>
      resolveProcessorConfig({
        NODE_ENV: "production",
        PROCESSOR_URL: "http://processor.example.com",
        PROCESSOR_SHARED_SECRET: "a".repeat(32),
      }),
    ).toThrow("PROCESSOR_HTTPS_REQUIRED");
  });

  it("accepts a strong secret and normalizes the endpoint", () => {
    expect(
      resolveProcessorConfig({
        NODE_ENV: "production",
        PROCESSOR_URL: "https://processor.example.com/",
        PROCESSOR_SHARED_SECRET: "a".repeat(32),
      }),
    ).toEqual({
      base: "https://processor.example.com",
      secret: "a".repeat(32),
    });
  });
});
