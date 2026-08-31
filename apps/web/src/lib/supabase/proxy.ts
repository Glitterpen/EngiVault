import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import {protectedSignInPath} from "@/lib/protected-route";

export async function refreshSession(request: NextRequest, requestHeaders = new Headers(request.headers)) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const env = publicEnv();
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const protectedRoute = request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname.startsWith("/founder");
  if (protectedRoute && !user) {
    const signInPath=protectedSignInPath(request.nextUrl.pathname);
    return NextResponse.redirect(new URL(`${signInPath}?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
  }
  return response;
}
