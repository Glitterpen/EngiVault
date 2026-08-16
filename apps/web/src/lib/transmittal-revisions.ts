export type AcceptedRevisionCandidate = {
  id: string;
  documentId: string;
  documentNumber: string;
  title: string;
  discipline: string;
  documentType: string;
  revisionCode: string;
  issueStatus: string;
  state: string;
  createdAt: string;
};

export type TransmittalRevision = Omit<AcceptedRevisionCandidate, "state" | "createdAt">;

export type PreparingTransmittalRevision = AcceptedRevisionCandidate;

export type RevisionTransmittalRecord = {
  revisionId: string;
  transmittalNumber: string;
  createdAt: string;
};

export function classifyLatestAcceptedRevisions(rows: AcceptedRevisionCandidate[]) {
  const latestByDocument = new Map<string, AcceptedRevisionCandidate>();
  const newestFirst = [...rows].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const row of newestFirst) {
    if (!latestByDocument.has(row.documentId)) latestByDocument.set(row.documentId, row);
  }

  const latest = [...latestByDocument.values()].sort((left, right) =>
    `${left.discipline}-${left.documentNumber}`.localeCompare(
      `${right.discipline}-${right.documentNumber}`,
    ),
  );

  return {
    ready: latest
      .filter((revision) => revision.state === "ready")
      .map((revision) => ({
        id: revision.id,
        documentId: revision.documentId,
        documentNumber: revision.documentNumber,
        title: revision.title,
        discipline: revision.discipline,
        documentType: revision.documentType,
        revisionCode: revision.revisionCode,
        issueStatus: revision.issueStatus,
      })),
    preparing: latest.filter((revision) => revision.state !== "ready"),
  };
}

export function groupRevisionTransmittals(rows: RevisionTransmittalRecord[]) {
  const result: Record<string, string[]> = {};
  const newestFirst = [...rows].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  for (const row of newestFirst) {
    const number = row.transmittalNumber.trim().toUpperCase();
    if (!number) continue;
    const existing = result[row.revisionId] ?? [];
    if (!existing.includes(number)) result[row.revisionId] = [...existing, number];
  }

  return result;
}
