import { describe, expect, it } from "vitest";
import {
  classifyLatestAcceptedRevisions,
  groupRevisionTransmittals,
  type AcceptedRevisionCandidate,
} from "./transmittal-revisions";

function revision(
  overrides: Partial<AcceptedRevisionCandidate> = {},
): AcceptedRevisionCandidate {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    documentId: "22222222-2222-4222-8222-222222222222",
    documentNumber: "EC-PRO-001",
    title: "Process Design Basis",
    discipline: "Process",
    documentType: "Report",
    revisionCode: "R01",
    issueStatus: "Issued for Review",
    state: "ready",
    createdAt: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

describe("transmittal revision selection", () => {
  it("makes the latest accepted and ready revision selectable", () => {
    const result = classifyLatestAcceptedRevisions([
      revision(),
      revision({
        id: "33333333-3333-4333-8333-333333333333",
        revisionCode: "A01",
        createdAt: "2026-08-02T10:00:00Z",
      }),
    ]);

    expect(result.ready).toHaveLength(1);
    expect(result.ready[0].revisionCode).toBe("A01");
    expect(result.preparing).toHaveLength(0);
  });

  it("does not expose an older ready revision while a newer accepted revision is preparing", () => {
    const result = classifyLatestAcceptedRevisions([
      revision(),
      revision({
        id: "33333333-3333-4333-8333-333333333333",
        revisionCode: "A01",
        state: "quarantined",
        createdAt: "2026-08-02T10:00:00Z",
      }),
    ]);

    expect(result.ready).toHaveLength(0);
    expect(result.preparing).toHaveLength(1);
    expect(result.preparing[0].revisionCode).toBe("A01");
  });

  it("keeps the latest accepted revision of each document", () => {
    const result = classifyLatestAcceptedRevisions([
      revision(),
      revision({
        id: "44444444-4444-4444-8444-444444444444",
        documentId: "55555555-5555-4555-8555-555555555555",
        documentNumber: "EC-PIP-001",
        discipline: "Piping",
        state: "processing",
      }),
    ]);

    expect(result.ready).toHaveLength(1);
    expect(result.preparing).toHaveLength(1);
  });
});

describe("transmittal issue history", () => {
  it("groups unique transmittal numbers by revision with the latest issue first", () => {
    expect(groupRevisionTransmittals([
      { revisionId: "revision-1", transmittalNumber: "tr-001", createdAt: "2026-08-01T10:00:00Z" },
      { revisionId: "revision-1", transmittalNumber: "TR-002", createdAt: "2026-08-03T10:00:00Z" },
      { revisionId: "revision-1", transmittalNumber: "TR-001", createdAt: "2026-08-02T10:00:00Z" },
      { revisionId: "revision-2", transmittalNumber: "TR-003", createdAt: "2026-08-04T10:00:00Z" },
    ])).toEqual({
      "revision-1": ["TR-002", "TR-001"],
      "revision-2": ["TR-003"],
    });
  });
});
