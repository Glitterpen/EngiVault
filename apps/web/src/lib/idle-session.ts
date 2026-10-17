export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;

/** Refreshes and navigation must not restart a session's inactivity clock. */
export function watchIdleSession(key: string, expire: () => void, warn?: (remainingSeconds: number | null) => void) {
  let lastActivity = Date.now();
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  let warningSeconds: number | null | undefined;
  const updateWarning = (seconds: number | null) => {
    if (seconds === warningSeconds) return;
    warningSeconds = seconds;
    warn?.(seconds);
  };
  const read = () => {
    try {
      const value = localStorage.getItem(key);
      const timestamp = value === null ? NaN : Number(value);
      if (Number.isFinite(timestamp) && timestamp <= Date.now()) lastActivity = timestamp;
    } catch { /* Private browsing: retain the in-memory deadline. */ }
  };
  const write = () => {
    try { localStorage.setItem(key, String(lastActivity)); } catch { /* In-memory fallback. */ }
  };
  const check = () => {
    if (expired) return true;
    read();
    if (Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
      expired = true;
      clearTimeout(timer);
      updateWarning(null);
      expire();
      return true;
    }
    return false;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (check()) return;
    const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivity);
    const warning = Boolean(warn) && remaining <= IDLE_WARNING_MS;
    updateWarning(warning ? Math.ceil(remaining / 1000) : null);
    // A warning only observes the existing deadline; it never records activity.
    timer = setTimeout(schedule, warning ? Math.min(1000, remaining) : warn ? remaining - IDLE_WARNING_MS : remaining);
  };
  const activity = (event: Event) => {
    // Includes touch-generated and keyboard-activated clicks, not mouse movement,
    // scrolling, token refreshes or programmatic clicks.
    if (!event.isTrusted) return;
    if (check()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    lastActivity = Date.now();
    write();
    schedule();
  };
  const storage = (event: StorageEvent) => { if (event.key === key) schedule(); };
  read();
  write();
  schedule();
  document.addEventListener("click", activity, true);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", schedule);
  window.addEventListener("pageshow", schedule);
  document.addEventListener("visibilitychange", schedule);
  return () => {
    clearTimeout(timer);
    document.removeEventListener("click", activity, true);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", schedule);
    window.removeEventListener("pageshow", schedule);
    document.removeEventListener("visibilitychange", schedule);
  };
}
