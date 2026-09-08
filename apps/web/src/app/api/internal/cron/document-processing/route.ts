import { timingSafeEqual } from "node:crypto";
import { processNextDocumentRevision } from "@/lib/processor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({error:{code:"UNAUTHORIZED"}},{status:401});
  }
  // One bounded job per tick. The database enforces locking, backoff and the
  // five-attempt limit; polling never resets failed jobs or bypasses scanning.
  try {
    const state = await processNextDocumentRevision();
    if (!["idle", "processed", "retrying", "failed"].includes(state)) throw new Error("Unexpected processing outcome");
    return Response.json({state},{headers:{"cache-control":"no-store"}});
  } catch {
    console.error("[document-processing] Queue worker unavailable");
    return Response.json({error:{code:"PROCESSING_UNAVAILABLE"}},{status:503});
  }
}
