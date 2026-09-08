// Only for EngiCite-generated diagnostics. Never filter customer documents,
// names, audit evidence, citations or third-party consent disclosures.
const internalDetail = /supabase|vercel|railway|openai|cloudflare|turnstile|clamav|clamd|postgrest|postgres|fastapi|engivault|resend\.com|api[_ -]?key|service[_ -]?role|shared[_ -]?secret|process\.env|processor[_ ]|\b(?:sql|traceback|stack trace|schema cache|service credential)\b|https?:\/\/|(?:[a-z0-9-]+\.)+(?:com|co|app|net|io)\b|[A-Z]:\\|\bat \S+ \(.+:\d+/i;

/** Stable support reference, not a secret or an authorization token. */
export function supportReference(code: unknown): string {
  const input = typeof code === "string" && code.length <= 160 ? code : "unknown";
  let hash = 2166136261;
  for (const character of input) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `EC-${(hash >>> 0).toString(16).padStart(8, "0").toUpperCase()}`;
}

/** Preserve useful application validation messages; never display infrastructure diagnostics. */
export function customerErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message && message.length <= 600 && !internalDetail.test(message) && !/[<>\r\n]/.test(message)
    ? message : fallback;
}

/** Untrusted database/storage errors only contribute an opaque reference, never their message. */
export function serviceFailureMessage(fallback: string, error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return `${fallback} Reference: ${supportReference(code)}.`;
}

export function processingFailureMessage(code: string): string {
  if (code === "MALWARE_DETECTED") return "The file failed the security check. Submit a clean copy.";
  if (code === "MALWARE_SCANNER_UNAVAILABLE") return "The security check is temporarily unavailable. Please retry shortly.";
  return "The file could not be processed. Please retry or contact EngiCite support.";
}
