import { describe, expect, it } from "vitest";
import { validateMdrPreview } from "./mdr-import";

const categories = [
  { kind: "discipline", code: "PRO", name: "Process" },
  { kind: "discipline", code: "PIP", name: "Piping" },
  { kind: "document_type", code: "REP", name: "Report" },
  { kind: "document_type", code: "DWG", name: "Drawing" },
  { kind: "document_type", code: "LST", name: "Register / List" },
  { kind: "document_type", code: "REQ", name: "Requisition" },
  { kind: "document_type", code: "PHI", name: "Philosophy" },
];

const validRow = {
  row_number: 5,
  document_number: "PRJ-PRO-001",
  title: "Process Design Basis",
  discipline: "PRO",
  document_type: "report",
  planned_submission_date: "2026-09-15",
  progress_weight: 2,
};

describe("MDR spreadsheet validation", () => {
  it("maps active category codes and names to controlled values", () => {
    const [row] = validateMdrPreview([validRow], categories, []);

    expect(row.is_valid).toBe(true);
    expect(row.discipline).toBe("Process");
    expect(row.document_type).toBe("Report");
  });

  it("accepts document types advertised by the EngiCite spreadsheet", () => {
    const rows = validateMdrPreview(
      [
        { ...validRow, row_number: 5, document_number: "PRJ-PRO-001", document_type: "List" },
        { ...validRow, row_number: 6, document_number: "PRJ-PRO-002", document_type: "Material Take Off" },
        { ...validRow, row_number: 7, document_number: "PRJ-PRO-003", document_type: "REQ" },
        { ...validRow, row_number: 8, document_number: "PRJ-PRO-004", document_type: "Philosophy" },
      ],
      [
        ...categories,
        { kind: "document_type", code: "MTO", name: "Material Take-Off" },
      ],
      [],
    );

    expect(rows.every((row) => row.is_valid)).toBe(true);
    expect(rows.map((row) => row.document_type)).toEqual([
      "Register / List",
      "Material Take-Off",
      "Requisition",
      "Philosophy",
    ]);
  });

  it("blocks existing and within-workbook document number duplicates", () => {
    const rows = validateMdrPreview(
      [validRow, { ...validRow, row_number: 6 }],
      categories,
      ["prj-pro-001"],
    );

    expect(rows.every((row) => !row.is_valid)).toBe(true);
    expect(rows[0].errors).toContain("Document Number already exists in this project.");
    expect(rows[0].errors).toContain("Document Number appears more than once in this workbook.");
  });

  it("accepts a trimmed custom document type without creating a category", () => {
    const [row] = validateMdrPreview(
      [{ ...validRow, document_type: "  Equipment Layout / Special Study  " }],
      categories.filter(category => category.kind === "discipline"),
      [],
    );
    expect(row.is_valid).toBe(true);
    expect(row.document_type).toBe("Equipment Layout / Special Study");
  });

  it.each(["", "   ", "x".repeat(81)])("rejects an empty or overlong type: %s", documentType => {
    const [row] = validateMdrPreview([{ ...validRow, document_type: documentType }], categories, []);
    expect(row.is_valid).toBe(false);
    expect(row.errors.some(error => error.startsWith("Document type:"))).toBe(true);
  });

  it("keeps punctuation significant in document numbers, like the database", () => {
    const rows = validateMdrPreview(
      [validRow, { ...validRow, row_number: 6, document_number: "PRJ/PRO/001" }],
      categories,
      ["PRJPRO001"],
    );
    expect(rows.every(row => row.is_valid)).toBe(true);
  });

  it("accepts unknown disciplines but still rejects uncontrolled issue statuses", () => {
    const [row] = validateMdrPreview(
      [{ ...validRow, document_type: "Special Study", discipline: "Civil Magic", required_issue_status: "Send immediately" }],
      categories,
      [],
    );

    expect(row.is_valid).toBe(false);
    expect(row.discipline).toBe("Civil Magic");
    expect(row.errors).not.toContain("Discipline does not match an active organisation category or code.");
    expect(row.errors).toContain("Required Issue Status is not an EngiCite issue status.");
  });

  it("accepts all non-empty spreadsheet disciplines and reuses case/whitespace variants", () => {
    const names = ["Rotating Equipment", "  rotating   equipment ", "Pipeline", "HVAC", "I&C", "IC", "Électricité", "X"];
    const rows = validateMdrPreview(names.map((discipline, index) => ({ ...validRow, discipline, row_number: index + 1, document_number: `DISC-${index}` })), categories, []);
    expect(rows.every(row => row.is_valid)).toBe(true);
    expect(rows.map(row => row.discipline)).toEqual(["Rotating Equipment", "Rotating Equipment", "Pipeline", "HVAC", "I&C", "IC", "Électricité", "X"]);
  });

  it("resolves a project manager's custom discipline code", () => {
    const [row] = validateMdrPreview([{ ...validRow, discipline: "rot" }], [...categories, { kind: "discipline", code: "ROT", name: "Rotating Equipment" }], []);
    expect(row.is_valid).toBe(true);
    expect(row.discipline).toBe("Rotating Equipment");
  });

  it.each(["", "   ", "x".repeat(81)])("rejects blank or overlong disciplines", discipline => {
    const [row] = validateMdrPreview([{ ...validRow, discipline }], categories, []);
    expect(row.is_valid).toBe(false);
    expect(row.errors.some(error => error.startsWith("Discipline:"))).toBe(true);
  });
});
