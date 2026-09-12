"use client";

import {useEffect, useState} from "react";
import type {Session} from "@supabase/supabase-js";
import {createClient} from "@/lib/supabase/browser";
import {watchIdleSession} from "@/lib/idle-session";
import {protectedSignInPath} from "@/lib/protected-route";

export function IdleSessionGuard({children}: {children: React.ReactNode}) {
  const [locked, setLocked] = useState(false);
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
      setLocked(true);
      const destination = `${protectedSignInPath(window.location.pathname)}?session=expired`;
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
        if (sessionKey) {
          setLocked(true);
          window.location.replace(protectedSignInPath(window.location.pathname));
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
      stop = watchIdleSession(key, expire);
    };
    const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => observe(session));
    return () => { disposed = true; stop?.(); subscription.unsubscribe(); clearTimeout(retry); };
  }, []);
  if (locked) return <main className="mx-auto max-w-lg p-8" role="status"><h1 className="text-xl font-semibold">Session locked</h1><p className="mt-3">Your session has ended. Completing secure sign-out… If you are offline, reconnect to continue.</p></main>;
  return children;
}
