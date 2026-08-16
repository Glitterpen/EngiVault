import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { trialDaysRemaining } from "@/lib/billing";
import { isPaystackCheckoutConfigured } from "@/lib/paystack";
import { isStripeCheckoutConfigured } from "@/lib/stripe";

type SearchParams = { checkout?: string; billing?: string };
type Entitlements = {
  projects?: number;
  storage_bytes?: number;
  monthly_ai_tokens?: number;
  members?: number;
};

export default async function SubscriptionPage({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ organisationId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireUser();
  const { data: organisation } = await supabase
    .rpc("get_my_organisations")
    .eq("organisation_id", organisationId)
    .eq("role", "organisation_admin")
    .maybeSingle();
  if (!organisation) notFound();

  const [{ data: subscription }, { data: billingCustomer }, { data: usage }] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "status,trial_ends_at,current_period_end,provider_name,provider_subscription_reference,plans(name,code,entitlements)",
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("billing_customers")
      .select("provider_name,provider_customer_reference,billing_email")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase.from("usage_ledger").select("metric,quantity").eq("organisation_id", organisationId),
  ]);
  const totals = new Map<string, number>();
  usage?.forEach((row) =>
    totals.set(row.metric, (totals.get(row.metric) ?? 0) + Number(row.quantity)),
  );
  const plan = Array.isArray(subscription?.plans) ? subscription.plans[0] : subscription?.plans;
  const entitlements = (plan?.entitlements ?? {}) as Entitlements;
  const trialDays = trialDaysRemaining(subscription?.trial_ends_at ?? null);
  const stripeReady = isStripeCheckoutConfigured();
  const paystackReady = isPaystackCheckoutConfigured();
  const providerSubscription = Boolean(subscription?.provider_subscription_reference);
  const activeProvider = providerSubscription
    ? (subscription?.provider_name ?? billingCustomer?.provider_name ?? "stripe")
    : null;
  const message = pageMessage(query);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href={`/app/${organisationId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45]"
      >
        <ArrowLeft size={16} /> Organisation
      </Link>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">
            Organisation billing
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Plan and subscription</h1>
          <p className="mt-2 text-sm text-[#617083]">
            One subscription protects and supports the organisation’s EngiCite workspace.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-[#e8f1ed] px-3 py-2 text-xs font-bold text-[#0c5b45]">
          <ShieldCheck size={15} /> Secure hosted payment options
        </span>
      </div>

      {message && (
        <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${message.tone}`} role="status">
          {message.text}
        </div>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="ev-card overflow-hidden">
          <div className="border-b border-[#e6ebe8] bg-[linear-gradient(135deg,#10243e,#183c5f)] p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-[#ff9a6d]">
                  Current plan
                </p>
                <h2 className="mt-2 text-3xl font-semibold">{plan?.name ?? "EngiCite Trial"}</h2>
                <p className="mt-2 text-sm text-white/65">
                  {subscription?.status === "trialing"
                    ? `${trialDays} day${trialDays === 1 ? "" : "s"} remaining in the free trial`
                    : statusDescription(subscription?.status)}
                </p>
              </div>
              <StatusBadge status={subscription?.status ?? "unassigned"} />
            </div>
            {subscription?.status === "trialing" && (
              <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-[#ed7138]"
                  style={{ width: `${Math.max(3, Math.min(100, (trialDays / 30) * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8">
            <h3 className="font-semibold">Included organisation capacity</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Entitlement label="Active projects" value={limit(entitlements.projects)} />
              <Entitlement label="Team members" value={limit(entitlements.members)} />
              <Entitlement label="Secure storage" value={storage(entitlements.storage_bytes)} />
              <Entitlement
                label="Monthly AI tokens"
                value={limit(entitlements.monthly_ai_tokens)}
              />
            </div>
            <div className="mt-6 rounded-xl bg-[#f5f8f7] p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[#617083]">
                Recorded AI usage
              </p>
              <p className="mt-2 text-xl font-semibold text-[#10243e]">
                {(totals.get("ai_tokens") ?? 0).toLocaleString()} tokens
              </p>
            </div>
          </div>
        </section>

        <aside className="ev-card h-fit p-6">
          <span className="grid size-11 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]">
            <CreditCard size={20} />
          </span>
          <h2 className="mt-4 text-xl font-semibold">
            {providerSubscription ? "Manage subscription" : "Continue after your trial"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#617083]">
            {providerSubscription
              ? `Open the secure ${providerLabel(activeProvider)} billing page to update payment details or manage the subscription.`
              : "Choose Stripe or Paystack. The provider shows the exact price and billing interval before you confirm payment."}
          </p>

          {!providerSubscription && (
            <ul className="mt-5 space-y-3 text-sm text-[#24384f]">
              <Benefit>No payment is taken before the trial ends</Benefit>
              <Benefit>Card details never pass through EngiCite</Benefit>
              <Benefit>Only a verified payment webhook activates access</Benefit>
            </ul>
          )}

          {providerSubscription ? (
            activeProvider === "paystack" ? (
              <form
                className="mt-6"
                action={`/api/v1/organisations/${organisationId}/billing/paystack/manage`}
                method="post"
              >
                <button className="ev-button w-full" type="submit" disabled={!paystackReady}>
                  <ExternalLink size={16} /> Manage with Paystack
                </button>
              </form>
            ) : (
              <form
                className="mt-6"
                action={`/api/v1/organisations/${organisationId}/billing/portal`}
                method="post"
              >
                <button className="ev-button w-full" type="submit" disabled={!stripeReady}>
                  <ExternalLink size={16} /> Manage with Stripe
                </button>
              </form>
            )
          ) : (
            <div className="mt-6 space-y-3">
              <PaymentOption
                description="Card checkout with deferred first billing while the trial is active."
                icon={<CreditCard size={18} />}
                name="Stripe"
              >
                {stripeReady ? (
                  <form
                    action={`/api/v1/organisations/${organisationId}/billing/checkout`}
                    method="post"
                  >
                    <button className="ev-button w-full" type="submit">
                      <Sparkles size={16} /> Continue with Stripe
                    </button>
                  </form>
                ) : (
                  <ConfigurationNotice provider="Stripe" />
                )}
              </PaymentOption>

              <PaymentOption
                description="Local and international payment channels supported by your Paystack account."
                icon={<Building2 size={18} />}
                name="Paystack"
              >
                {paystackReady ? (
                  trialDays > 0 && subscription?.status === "trialing" ? (
                    <div className="rounded-lg bg-[#f5f8f7] px-3 py-2 text-xs leading-5 text-[#617083]">
                      Available in {trialDays} day{trialDays === 1 ? "" : "s"}. Paystack charges the
                      first plan payment at checkout, so EngiCite will not open it early.
                    </div>
                  ) : (
                    <form
                      action={`/api/v1/organisations/${organisationId}/billing/paystack/checkout`}
                      method="post"
                    >
                      <button className="ev-button w-full" type="submit">
                        <Sparkles size={16} /> Continue with Paystack
                      </button>
                    </form>
                  )
                ) : (
                  <ConfigurationNotice provider="Paystack" />
                )}
              </PaymentOption>
            </div>
          )}

          {billingCustomer?.billing_email && (
            <p className="mt-4 text-center text-[11px] text-[#7b8998]">
              Billing contact: {billingCustomer.billing_email}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function PaymentOption({
  children,
  description,
  icon,
  name,
}: {
  children: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  name: string;
}) {
  return (
    <div className="rounded-xl border border-[#e2e8e5] p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#eef3f7] text-[#183c5f]">
          {icon}
        </span>
        <div>
          <p className="font-semibold text-[#10243e]">{name}</p>
          <p className="mt-1 text-xs leading-5 text-[#617083]">{description}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ConfigurationNotice({ provider }: { provider: string }) {
  return (
    <div className="rounded-lg bg-[#fff8f4] px-3 py-2 text-xs leading-5 text-[#8a4b30]">
      {provider} test configuration is not connected yet.
    </div>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#e8f1ed] text-[#0c5b45]">
        <Check size={12} strokeWidth={3} />
      </span>
      {children}
    </li>
  );
}

function Entitlement({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e2e8e5] p-4">
      <p className="text-lg font-semibold text-[#10243e]">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold capitalize text-white">
      {status.replaceAll("_", " ")}
    </span>
  );
}

function limit(value?: number) {
  if (value === -1) return "Unlimited";
  return (value ?? 0).toLocaleString();
}

function storage(value?: number) {
  if (value === -1) return "Unlimited";
  return `${Math.round((value ?? 0) / 1_073_741_824)} GB`;
}

function statusDescription(status?: string) {
  if (status === "active") return "Your organisation subscription is active.";
  if (status === "past_due") return "Payment is overdue. Update the payment method to continue.";
  if (status === "paused") return "The organisation subscription is paused.";
  if (status === "cancelled") return "The organisation subscription has been cancelled.";
  return "No active organisation subscription.";
}

function providerLabel(provider: string | null) {
  return provider === "paystack" ? "Paystack" : "Stripe";
}

function pageMessage(query: SearchParams) {
  if (query.checkout === "success") {
    return {
      text: "Checkout completed. Stripe is confirming the subscription; this page will reflect the verified webhook shortly.",
      tone: "border-[#bcd8cc] bg-[#f0f8f4] text-[#0c5b45]",
    };
  }
  if (query.checkout === "paystack-success") {
    return {
      text: "Payment verified. Paystack is confirming the recurring subscription; this page will reflect the signed webhook shortly.",
      tone: "border-[#bcd8cc] bg-[#f0f8f4] text-[#0c5b45]",
    };
  }
  if (query.checkout === "cancelled") {
    return {
      text: "Checkout was cancelled. No subscription change was made.",
      tone: "border-[#dce2e9] bg-white text-[#617083]",
    };
  }
  if (query.billing) {
    if (query.billing === "trial-ended") {
      return {
        text: "Your 30-day trial has ended. Activate the organisation subscription to reopen its project workspaces.",
        tone: "border-[#f0c9b7] bg-[#fff8f4] text-[#8a4b30]",
      };
    }
    if (query.billing === "paystack-after-trial") {
      return {
        text: "Paystack checkout opens when the free trial ends because its plan checkout charges the first payment immediately. You can use Stripe now or return at the end of the trial.",
        tone: "border-[#dce2e9] bg-white text-[#617083]",
      };
    }
    return {
      text: "The secure billing service is temporarily unavailable. Please try again or contact EngiCite support.",
      tone: "border-[#f0c9b7] bg-[#fff8f4] text-[#8a4b30]",
    };
  }
  return null;
}
