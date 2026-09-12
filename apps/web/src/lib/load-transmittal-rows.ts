import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";

export const TRANSMITTAL_PAGE_SIZE = 500;
type Page = {data: unknown[] | null; error: unknown; count: number | null};

export function loadTransmittalHistoryRows<T>(client: SupabaseClient, organisationId: string, projectId: string) {
  // Read all visible included items; the page filters manifest.kind after loading.
  // Embedded JSON-path filters are not supported by the audited member transport.
  // Keep that transport and its member-scoped authorisation intact.
  return loadTransmittalRows<T>((offset) => client.from("work_package_items")
    .select("revision_id,document_id,document_number,revision_code,discipline,issue_status,work_packages!inner(id,state,package_number,manifest,created_at)", {count: "exact"})
    .eq("organisation_id", organisationId)
    .eq("project_id", projectId)
    .eq("inclusion_state", "included")
    .order("id")
    .range(offset, offset + TRANSMITTAL_PAGE_SIZE - 1));
}

// Complete history is mandatory: a truncated read must never imply "not issued".
export async function loadTransmittalRows<T>(read: (offset: number) => PromiseLike<Page>): Promise<{data: T[]; error: null}> {
  const rows: T[] = [];
  for (;;) {
    const page = await read(rows.length);
    if (page.error || !page.data || page.count === null) throw new Error("Transmittal status unavailable");
    rows.push(...page.data as T[]);
    if (rows.length >= page.count) return {data: rows, error: null};
    if (!page.data.length) throw new Error("Transmittal status incomplete");
  }
}
