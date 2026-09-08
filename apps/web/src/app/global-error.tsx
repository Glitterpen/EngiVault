"use client";
import { ServiceError } from "@/components/service-error";

export default function GlobalError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return <html lang="en"><head><title>EngiCite — Please try again</title></head><body style={{ margin: 0 }}><ServiceError error={error} retry={unstable_retry} /></body></html>;
}
