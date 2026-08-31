const invitationPath = /^\/invite\/[a-f0-9]{64}$/i;

function primaryDestination(candidate: string) {
  if (
    candidate === "/app" ||
    candidate === "/organisation/setup" ||
    candidate === "/founder" ||
    candidate === "/founder/security" ||
    candidate.startsWith("/app/") ||
    candidate.startsWith("/app?") ||
    invitationPath.test(candidate)
  ) {
    return candidate;
  }

  return null;
}

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

  const primary = primaryDestination(candidate);
  if (primary) return primary;

  const recoveryUrl = new URL(candidate, "https://engicite.local");
  if (recoveryUrl.pathname === "/auth/update-password") {
    const recoveryDestination = primaryDestination(recoveryUrl.searchParams.get("next")?.trim() ?? "") ?? "/app";
    return `/auth/update-password?next=${encodeURIComponent(recoveryDestination)}`;
  }

  return "/app";
}
