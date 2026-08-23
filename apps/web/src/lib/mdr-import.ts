import { z } from "zod";
import { DOCUMENT_ISSUE_STATUS_VALUES } from "@/lib/document-issue-status";

export const mdrImportRowSchema = z.object({
  row_number: z.number().int().min(1).max(1_000_000),
  document_number: z.string().trim().toUpperCase().min(2).max(80),
  title: z.string().trim().min(2).max(240),
  discipline: z.string().trim().min(1).max(80),
  document_type: z.string().trim().min(1).max(80),
  planned_submission_date: z.iso.date(),
  planned_final_date: z.union([z.iso.date(), z.null()]).optional(),
  required_issue_status: z.string().trim().max(160).nullable().optional(),
  responsible_party: z.string().trim().max(160).nullable().optional(),
  progress_weight: z.number().positive().max(1000).default(1),
  area: z.string().trim().max(80).nullable().optional(),
  system: z.string().trim().max(80).nullable().optional(),
  work_package: z.string().trim().max(80).nullable().optional(),
});

export const mdrImportPayloadSchema = z.object({
  rows: z.array(mdrImportRowSchema).min(1).max(500),
});

export type MdrImportRow = z.infer<typeof mdrImportRowSchema>;

export type ProcessorMdrRow = Partial<MdrImportRow> & {
  row_number: number;
  errors?: string[];
};

type Category = { code: string; name: string; kind: string };

export type MdrPreviewRow = Partial<MdrImportRow> & {
  row_number: number;
  errors: string[];
  is_valid: boolean;
};

export function validateMdrPreview(
  rows: ProcessorMdrRow[],
  categories: Category[],
  existingDocumentNumbers: string[],
): MdrPreviewRow[] {
  const disciplines = categoryMap(categories.filter((category) => category.kind === "discipline"));
  const documentTypes = categoryMap(
    categories.filter((category) => category.kind === "document_type"),
    { list: "Register / List", register: "Register / List" },
  );
  const issueStatuses = new Map(DOCUMENT_ISSUE_STATUS_VALUES.map((value) => [value.toLowerCase(), value]));
  const existing = new Set(existingDocumentNumbers.map(normalise));
  const counts = new Map<string, number>();

  for (const row of rows) {
    const number = normalise(String(row.document_number ?? ""));
    if (number) counts.set(number, (counts.get(number) ?? 0) + 1);
  }

  return rows.map((source) => {
    const errors = [...(source.errors ?? [])];
    const discipline = disciplines.get(normalise(String(source.discipline ?? "")));
    const documentType = documentTypes.get(normalise(String(source.document_type ?? "")));
    const documentNumber = String(source.document_number ?? "").trim().toUpperCase();
    const issueStatusInput = String(source.required_issue_status ?? "").trim();
    const issueStatus = issueStatusInput ? issueStatuses.get(issueStatusInput.toLowerCase()) : null;
    if (!discipline) errors.push("Discipline does not match an active organisation category or code.");
    if (!documentType) errors.push("Document Type does not match an active organisation category or code.");
    if (documentNumber && existing.has(normalise(documentNumber))) errors.push("Document Number already exists in this project.");
    if (documentNumber && (counts.get(normalise(documentNumber)) ?? 0) > 1) errors.push("Document Number appears more than once in this workbook.");
    if (issueStatusInput && !issueStatus) errors.push("Required Issue Status is not an EngiCite issue status.");

    const candidate = {
      row_number: source.row_number,
      document_number: documentNumber,
      title: String(source.title ?? "").trim(),
      discipline: discipline ?? String(source.discipline ?? "").trim(),
      document_type: documentType ?? String(source.document_type ?? "").trim(),
      planned_submission_date: source.planned_submission_date,
      planned_final_date: source.planned_final_date ?? null,
      required_issue_status: issueStatus,
      responsible_party: nullableText(source.responsible_party),
      progress_weight: source.progress_weight ?? 1,
      area: nullableText(source.area),
      system: nullableText(source.system),
      work_package: nullableText(source.work_package),
    };
    const parsed = mdrImportRowSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors.push(`${label(issue.path[0])}: ${issue.message}`);
    }
    return {
      ...(parsed.success ? parsed.data : candidate),
      row_number: source.row_number,
      errors: [...new Set(errors)],
      is_valid: errors.length === 0 && parsed.success,
    };
  });
}

function categoryMap(categories: Category[], aliases: Record<string, string> = {}) {
  const result = new Map<string, string>();
  for (const category of categories) {
    result.set(normalise(category.code), category.name);
    result.set(normalise(category.name), category.name);
  }
  for (const [alias, controlledName] of Object.entries(aliases)) {
    const controlledValue = result.get(normalise(controlledName));
    if (controlledValue) result.set(normalise(alias), controlledValue);
  }
  return result;
}

function normalise(value: string) {
  return value.trim().toLowerCase().replaceAll("&", "and").replace(/[^a-z0-9]+/g, "");
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function label(value: PropertyKey | undefined) {
  return String(value ?? "Row").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
