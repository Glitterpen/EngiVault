const invitationPath = /^\/invite\/[a-f0-9]{64}$/i;

export function safeAuthDestination(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";

  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\r\n]/.test(candidate)
  ) {
    return "/app";
  }

  if (
    candidate === "/app" ||
    candidate === "/organisation/setup" ||
    candidate.startsWith("/app/") ||
    candidate.startsWith("/app?") ||
    invitationPath.test(candidate)
  ) {
    return candidate;
  }

  return "/app";
}
