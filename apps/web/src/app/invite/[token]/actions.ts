"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/i);

export async function switchInvitationAccount(token: string) {
  const parsed = tokenSchema.safeParse(token);
  const supabase = await createClient();
  await supabase.auth.signOut();

  const destination = parsed.success ? `/invite/${parsed.data}` : "/app";
  redirect(`/login?next=${encodeURIComponent(destination)}`);
}
