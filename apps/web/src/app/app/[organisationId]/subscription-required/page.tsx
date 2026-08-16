import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, LockKeyhole } from "lucide-react";
import { requireUser } from "@/lib/auth";

export default async function SubscriptionRequiredPage({
  params,
}: {
  params: Promise<{ organisationId: string }>;
}) {
  const { organisationId } = await params;
  const { supabase } = await requireUser();
  const { data } = await supabase
    .rpc("get_my_organisations")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const organisation = data as { name: string; role: string } | null;
  if (!organisation) notFound();
  const administrator = organisation.role === "organisation_admin";

  return (
    <div className="mx-auto max-w-xl py-10 sm:py-20">
      <section className="ev-card p-7 text-center sm:p-10">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff0e9] text-[#e8733f]">
          <LockKeyhole size={24} />
        </span>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">
          Organisation subscription
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Workspace temporarily paused</h1>
        <p className="mt-4 text-sm leading-7 text-[#617083]">
          The 30-day trial for {organisation.name} has ended and an active subscription is
          required to reopen its project workspaces.
        </p>
        {administrator ? (
          <Link className="ev-button mt-7" href={`/app/${organisationId}/subscription?billing=trial-ended`}>
            <CreditCard size={16} /> Continue to secure checkout
          </Link>
        ) : (
          <div className="mt-7 rounded-xl bg-[#f5f8f7] p-4 text-sm text-[#24384f]">
            Please ask your organisation administrator to activate the EngiCite subscription.
          </div>
        )}
        <Link className="mt-5 block text-sm font-semibold text-[#0c5b45]" href="/app">
          Return to organisations
        </Link>
      </section>
    </div>
  );
}
