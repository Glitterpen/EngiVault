export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Refreshes and navigation must not restart a session's inactivity clock. */
export function watchIdleSession(key: string, expire: () => void) {
  let lastActivity = Date.now();
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
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
      expire();
      return true;
    }
    return false;
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!check()) timer = setTimeout(schedule, IDLE_TIMEOUT_MS - (Date.now() - lastActivity));
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
