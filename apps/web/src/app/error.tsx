"use client";
import { ServiceError } from "@/components/service-error";

export default function ErrorPage({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <ServiceError error={error} retry={unstable_retry} />;
}
