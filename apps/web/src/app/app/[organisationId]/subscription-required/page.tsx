import Link from "next/link";
import { notFound } from "next/navigation";
import { CreditCard, FileClock, LockKeyhole, ShieldCheck } from "lucide-react";
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
          The 90-day card-free pilot for {organisation.name} has ended and an active subscription is
          required to reopen its project workspaces.
        </p>
        <div className="mt-6 rounded-2xl border border-[#bcd8cc] bg-[#f0f8f4] p-5 text-left">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#0c5b45]">
              <FileClock size={19} />
            </span>
            <div>
              <h2 className="font-semibold text-[#10243e]">Your project history is retained</h2>
              <p className="mt-2 text-sm leading-6 text-[#47665b]">
                Pilot expiry pauses workspace access; it does not delete the organisation, projects,
                MDR, revisions, uploaded files, reports, transmittals or audit history. Activating the
                subscription restores the same workspace exactly where the team stopped.
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs font-bold text-[#0c5b45]">
                <ShieldCheck size={15} /> Retained while the organisation account remains registered
              </p>
            </div>
          </div>
        </div>
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
