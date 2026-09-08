import { describe, expect, it } from "vitest";
import { customerErrorMessage, processingFailureMessage, serviceFailureMessage, supportReference } from "./customer-messages";

describe("customer-facing diagnostics", () => {
  const fallback = "EngiCite could not complete this request. Please try again.";
  it.each([
    "Supabase storage error", "VERCEL deployment failed", "Railway upstream failure",
    "OpenAI quota exceeded", "Cloudflare Turnstile failure", "ClamAV scanner unavailable",
    "PostgREST schema cache", "PostgreSQL exception", "FastAPI validation failed",
    "SUPABASE_SERVICE_ROLE_KEY required", "PROCESSOR_URL_REQUIRED", "Invalid service credential",
    "Fetch failed at https://private-host.example/path", "Error from api.resend.com",
    "<html>Bad Gateway</html>", "Error\n at handler (server.js:1)", "x".repeat(601),
  ])("does not forward internal diagnostics: %s", message => {
    expect(customerErrorMessage(new Error(message), fallback)).toBe(fallback);
  });
  it("keeps actionable validation and handles non-error rejections", () => {
    expect(customerErrorMessage(new Error("Choose an Excel .xlsx file no larger than 5 MB."), fallback)).toBe("Choose an Excel .xlsx file no larger than 5 MB.");
    expect(customerErrorMessage(undefined, fallback)).toBe(fallback);
    expect(customerErrorMessage({ message: "raw object" }, fallback)).toBe(fallback);
  });
  it("never includes storage/database error text in service messages", () => {
    expect(serviceFailureMessage(fallback, { message: "Supabase secret details", code: "PGRST202" })).toBe(`${fallback} Reference: ${supportReference("PGRST202")}.`);
    expect(serviceFailureMessage(fallback, new Error("private infrastructure"))).not.toContain("private");
    expect(supportReference("PGRST202")).toMatch(/^EC-[A-F0-9]{8}$/);
    expect(supportReference("PGRST202")).toBe(supportReference("PGRST202"));
  });
  it("uses controlled failure descriptions even for old stored vendor errors", () => {
    expect(processingFailureMessage("MALWARE_DETECTED")).toContain("security check");
    expect(processingFailureMessage("MALWARE_SCANNER_UNAVAILABLE")).toContain("temporarily unavailable");
    expect(processingFailureMessage("SUPABASE_STORAGE_ERROR")).not.toMatch(/supabase/i);
  });
});
