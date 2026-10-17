"use client";

import {useEffect, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {createClient} from "@/lib/supabase/browser";
import {watchIdleSession} from "@/lib/idle-session";
import {protectedSignInUrl} from "@/lib/protected-route";

export function IdleSessionWarning({remainingSeconds}: {remainingSeconds: number}) {
  return <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto flex max-w-xl flex-col gap-3 rounded-2xl border border-orange-200 bg-white p-4 text-slate-900 shadow-xl sm:inset-x-6 sm:bottom-6 sm:flex-row sm:items-center sm:p-5" aria-label="Inactivity warning">
    <div className="min-w-0 flex-1">
      <p className="font-semibold" role="alert">Your session will end within a minute due to inactivity.</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">Click anywhere to stay signed in. <span className="whitespace-nowrap font-medium text-slate-900" aria-hidden="true">{remainingSeconds}s remaining</span></p>
    </div>
    <button type="button" className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600">Continue working</button>
  </aside>;
}

export function IdleSessionGuard({children}: {children: React.ReactNode}) {
  const [locked, setLocked] = useState(false);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  useEffect(() => {
    const client = createClient();
    let stop: (() => void) | undefined;
    let sessionKey: string | undefined;
    let disposed = false;
    let expiring = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const expire = () => {
      if (expiring || disposed) return;
      expiring = true;
      setWarningSeconds(null);
      setLocked(true);
      const destination = protectedSignInUrl(window.location.pathname,window.location.search,"expired");
      const logout = async () => {
        try {
          const response = await fetch("/auth/idle-logout", {
            method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error("Logout pending");
          // Clear the browser client's in-memory state as well as server cookies.
          await client.auth.signOut({scope: "local"});
          if (!disposed) window.location.replace(destination);
        } catch {
          // Fail closed while offline; do not expose the workspace on failure.
          if (!disposed) retry = setTimeout(() => void logout(), 5000);
        }
      };
      // Never await another auth operation inside onAuthStateChange's lock.
      retry = setTimeout(() => void logout(), 0);
    };
    const observe = (session: Session | null) => {
      if (disposed || expiring) return;
      if (!session) {
        stop?.(); stop = undefined;
        setWarningSeconds(null);
        if (sessionKey) {
          setLocked(true);
          window.location.replace(protectedSignInUrl(window.location.pathname,window.location.search));
        }
        sessionKey = undefined;
        return;
      }
      // session_id remains stable across token refreshes, but changes at login.
      let identity = session.user.last_sign_in_at ?? session.user.id;
      try { identity = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).session_id ?? identity; } catch { /* SDK session fallback */ }
      const key = `engicite:idle:${session.user.id}:${identity}`;
      if (key === sessionKey) return;
      stop?.(); sessionKey = key;
      setWarningSeconds(null);
      stop = watchIdleSession(key, expire, seconds => {
        if (!disposed && !expiring) setWarningSeconds(seconds);
      });
    };
    const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => observe(session));
    return () => { disposed = true; stop?.(); subscription.unsubscribe(); clearTimeout(retry); };
  }, []);
  if (locked) return <main className="mx-auto max-w-lg p-8" role="status"><h1 className="text-xl font-semibold">Session locked</h1><p className="mt-3">Your session has ended. Completing secure sign-out… If you are offline, reconnect to continue.</p></main>;
  return <>{children}{warningSeconds !== null && <IdleSessionWarning remainingSeconds={warningSeconds}/>}</>;
}
