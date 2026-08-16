import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";

const configurationSchema = z.object({
  secretKey: z.string().trim().min(20),
  planCode: z.string().trim().regex(/^PLN_[A-Za-z0-9]+$/),
  planAmountSubunit: z.coerce.number().int().positive(),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  localPlanCode: z.string().trim().min(1).max(40),
  appUrl: z.url(),
});

const initializeResponseSchema = z.object({
  authorization_url: z.url(),
  access_code: z.string().min(1),
  reference: z.string().min(1),
});

const manageLinkSchema = z.object({ link: z.url() });

export type PaystackRecord = Record<string, unknown>;

export function paystackConfiguration() {
  return configurationSchema.parse({
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    planCode: process.env.PAYSTACK_PLAN_CODE,
    planAmountSubunit: process.env.PAYSTACK_PLAN_AMOUNT_SUBUNIT,
    currency: process.env.PAYSTACK_CURRENCY ?? "NGN",
    localPlanCode: process.env.PAYSTACK_ENGICITE_PLAN_CODE ?? "team",
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function isPaystackCheckoutConfigured() {
  return configurationSchema.safeParse({
    secretKey: process.env.PAYSTACK_SECRET_KEY,
    planCode: process.env.PAYSTACK_PLAN_CODE,
    planAmountSubunit: process.env.PAYSTACK_PLAN_AMOUNT_SUBUNIT,
    currency: process.env.PAYSTACK_CURRENCY ?? "NGN",
    localPlanCode: process.env.PAYSTACK_ENGICITE_PLAN_CODE ?? "team",
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  }).success;
}

export async function initializePaystackSubscription(input: {
  email: string;
  organisationId: string;
}) {
  const configuration = paystackConfiguration();
  const reference = `ec-${input.organisationId.slice(0, 8)}-${Date.now()}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const data = await paystackRequest<unknown>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: String(configuration.planAmountSubunit),
      currency: configuration.currency,
      plan: configuration.planCode,
      reference,
      callback_url: `${configuration.appUrl}/api/v1/organisations/${input.organisationId}/billing/paystack/callback`,
      metadata: JSON.stringify({
        organisation_id: input.organisationId,
        plan_code: configuration.localPlanCode,
      }),
    }),
  });
  return initializeResponseSchema.parse(data);
}

export async function verifyPaystackTransaction(reference: string) {
  return paystackRequest<PaystackRecord>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
}

export async function fetchPaystackSubscription(subscriptionCode: string) {
  return paystackRequest<PaystackRecord>(
    `/subscription/${encodeURIComponent(subscriptionCode)}`,
    { method: "GET" },
  );
}

export async function createPaystackManageLink(subscriptionCode: string) {
  const data = await paystackRequest<unknown>(
    `/subscription/${encodeURIComponent(subscriptionCode)}/manage/link`,
    { method: "GET" },
  );
  return manageLinkSchema.parse(data).link;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { secretKey } = paystackConfiguration();
  const response = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!response.ok || payload?.status !== true || payload.data === undefined) {
    throw new Error(payload?.message || `Paystack request failed with HTTP ${response.status}.`);
  }
  return payload.data;
}
