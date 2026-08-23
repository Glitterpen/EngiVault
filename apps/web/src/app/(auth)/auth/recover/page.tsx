import Link from "next/link";
import { safeAuthDestination } from "@/lib/auth-destination";

type RecoverySearchParams = {
  next?: string;
  token_hash?: string;
  type?: string;
};

export default async function RecoveryConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<RecoverySearchParams>;
}) {
  const params = await searchParams;
  const destination = safeAuthDestination(params.next);
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const validRequest = tokenHash.length > 0 && params.type === "recovery";
  const loginHref = destination === "/app"
    ? "/login"
    : `/login?next=${encodeURIComponent(destination)}`;

  return <div className="w-full max-w-md">
    <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e8733f]">Secure account recovery</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] text-[#10243e]">Confirm password reset</h1>
    {validRequest ? <>
      <p className="mt-3 text-sm leading-6 text-[#617083]">
        Your reset link is ready. Continue below to verify it and choose a new password. This extra step prevents email-security scanners from using the link before you do.
      </p>
      <form action="/auth/callback" method="post" className="mt-6">
        <input type="hidden" name="token_hash" value={tokenHash}/>
        <input type="hidden" name="type" value="recovery"/>
        <input type="hidden" name="next" value={destination}/>
        <button className="ev-button w-full justify-center" type="submit">Continue to password reset</button>
      </form>
      <Link className="mt-4 inline-flex w-full justify-center text-sm font-semibold text-[#536479] hover:text-[#10243e]" href={loginHref}>Return to sign in</Link>
    </> : <>
      <div className="mt-6 rounded-xl border border-[#efc7bb] bg-[#fff7f4] p-4 text-sm leading-6 text-[#8b3d1f]">
        This password-reset link is incomplete or unavailable. Request a fresh reset email from the sign-in page.
      </div>
      <Link className="ev-button mt-5 w-full justify-center" href={loginHref}>Return to sign in</Link>
    </>}
  </div>;
}
