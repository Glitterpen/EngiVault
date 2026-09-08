"use client";

import { supportReference } from "@/lib/customer-messages";

export function ServiceError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main style={{ minHeight: "70vh", display: "grid", placeItems: "center", padding: 24, background: "#f5f7f9", color: "#10243e", fontFamily: "Arial, sans-serif" }}>
    <section role="alert" style={{ maxWidth: 480, padding: 32, border: "1px solid #dfe7e3", borderRadius: 16, background: "white" }}>
      <p style={{ color: "#0c5b45", fontWeight: 700 }}>EngiCite</p>
      <h1 style={{ fontSize: 26 }}>We couldn’t load this page</h1>
      <p style={{ lineHeight: 1.6 }}>Please try again. If the problem continues, contact EngiCite support with the reference below.</p>
      <p style={{ fontSize: 12 }}>Reference: {supportReference(error.digest)}</p>
      <button type="button" onClick={retry} style={{ background: "#0c5b45", color: "white", border: 0, borderRadius: 8, padding: "12px 20px", cursor: "pointer" }}>Try again</button>
    </section>
  </main>;
}
