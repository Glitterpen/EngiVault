import "server-only";

export const TRANSMITTAL_PAGE_SIZE = 500;
type Page = {data: unknown[] | null; error: unknown; count: number | null};

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
