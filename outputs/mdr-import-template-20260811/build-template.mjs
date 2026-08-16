import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/ahmed/Documents/EngiVault/outputs/mdr-import-template-20260811";
const publicPath = "C:/Users/ahmed/Documents/EngiVault/apps/web/public/templates/EngiCite-MDR-Import-Template.xlsx";

const issueStatuses = [
  "Draft / Work in Progress",
  "Issued for Internal Review",
  "Issued for Interdiscipline Check (IDC)",
  "Issued for Review (IFR)",
  "Issued for Client Review",
  "Issued for Comment",
  "Issued for Approval (IFA)",
  "Approved / Final",
  "Issued for Design (IFD)",
  "Issued for Tender (IFT)",
  "Issued for Bid (IFB)",
  "Issued for Quotation (IFQ)",
  "Issued for Procurement (IFP)",
  "Issued for Purchase",
  "Issued for Vendor Approval",
  "Issued for Manufacture (IFM)",
  "Issued for Fabrication (IFF)",
  "Approved for Construction (AFC)",
  "Issued for Construction (IFC)",
  "Issued for Installation",
  "Issued for Site Use",
  "Issued for Commissioning",
  "Issued for Start-up",
  "Issued for Operations",
  "Issued for Information (IFI)",
  "Issued for Coordination",
  "Issued for HAZOP Review",
  "Issued for Safety Review",
  "Issued for Regulatory Approval",
  "Redline / Marked-up As-Built",
  "As-Built",
  "Final As-Built",
  "Issued for Handover",
  "Approved for Handover",
  "Final Documentation",
  "Record / Reference",
  "Superseded",
  "Cancelled",
  "Void / Withdrawn",
];

const disciplines = [
  "Process", "Piping", "Mechanical", "Civil", "Structural", "Electrical",
  "Instrumentation", "Telecommunications", "HSE", "Project", "Document Control",
];
const documentTypes = [
  "Drawing", "Datasheet", "Specification", "Calculation", "Report", "Procedure",
  "Requisition", "Material Take-Off", "Schedule", "List", "Philosophy", "Manual",
];

const workbook = Workbook.create();
const input = workbook.worksheets.add("MDR Import");
const instructions = workbook.worksheets.add("Instructions");
const allowed = workbook.worksheets.add("Allowed Values");

input.showGridLines = false;
input.mergeCells("A1:L1");
input.getRange("A1:L1").values = [["EngiCite Master Document Register Import"]];
input.getRange("A1:L1").format = {
  fill: "#10243E",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
};
input.getRange("A1:L1").format.rowHeight = 34;
input.mergeCells("A2:L2");
input.getRange("A2:L2").values = [["Required columns are marked *. Keep the headings unchanged. Dates must be real Excel dates or YYYY-MM-DD."]];
input.getRange("A2:L2").format = {
  fill: "#F1F7F4",
  font: { color: "#0C5B45", italic: true },
  wrapText: true,
};
input.getRange("A2:L2").format.rowHeight = 28;

const headers = [[
  "Document Number *", "Title *", "Discipline *", "Document Type *",
  "Planned Submission Date *", "Planned Final Date", "Required Issue Status",
  "Responsible Party", "Progress Weight", "Area", "System", "Work Package",
]];
input.getRange("A4:L4").values = headers;
input.getRange("A4:E4").format = {
  fill: "#E8733F",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  verticalAlignment: "center",
};
input.getRange("F4:L4").format = {
  fill: "#0C5B45",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  verticalAlignment: "center",
};
input.getRange("A4:L4").format.rowHeight = 36;
input.getRange("A5:L54").format = {
  fill: "#FFFFFF",
  font: { color: "#24384F" },
  borders: { preset: "inside", style: "thin", color: "#E4EBE7" },
  verticalAlignment: "center",
};
input.getRange("A5:L54").format.rowHeight = 22;
input.getRange("E5:F504").format.numberFormat = "yyyy-mm-dd";
input.getRange("I5:I504").format.numberFormat = "0.00";
input.getRange("C5:C504").dataValidation = { rule: { type: "list", formula1: "'Allowed Values'!$A$2:$A$12" } };
input.getRange("D5:D504").dataValidation = { rule: { type: "list", formula1: "'Allowed Values'!$B$2:$B$13" } };
input.getRange(`G5:G504`).dataValidation = { rule: { type: "list", formula1: `'Allowed Values'!$C$2:$C$${issueStatuses.length + 1}` } };
input.freezePanes.freezeRows(4);
input.getRange("A:A").format.columnWidth = 25;
input.getRange("B:B").format.columnWidth = 40;
input.getRange("C:D").format.columnWidth = 22;
input.getRange("E:F").format.columnWidth = 24;
input.getRange("G:G").format.columnWidth = 34;
input.getRange("H:H").format.columnWidth = 25;
input.getRange("I:I").format.columnWidth = 17;
input.getRange("J:L").format.columnWidth = 21;

instructions.showGridLines = false;
instructions.mergeCells("A1:F1");
instructions.getRange("A1:F1").values = [["How to import an MDR into EngiCite"]];
instructions.getRange("A1:F1").format = { fill: "#10243E", font: { bold: true, color: "#FFFFFF", size: 17 } };
instructions.getRange("A1:F1").format.rowHeight = 34;
instructions.getRange("A3:B9").values = [
  ["Step", "Instruction"],
  [1, "Open the MDR Import sheet and enter one planned deliverable per row."],
  [2, "Do not rename the required headings or add formulas to import cells."],
  [3, "Discipline and Document Type must match an active EngiCite category name or short code."],
  [4, "Use real Excel dates or YYYY-MM-DD. Planned Final Date cannot precede the submission date."],
  [5, "Progress Weight is optional and defaults to 1. Valid values are greater than 0 and no more than 1000."],
  [6, "Save as .xlsx, upload it in the MDR, review the preview, then confirm import."],
];
instructions.getRange("A3:B3").format = { fill: "#0C5B45", font: { bold: true, color: "#FFFFFF" } };
instructions.getRange("A4:B9").format = { borders: { preset: "inside", style: "thin", color: "#DCE6E1" }, wrapText: true };
instructions.getRange("A:A").format.columnWidth = 10;
instructions.getRange("B:B").format.columnWidth = 92;
instructions.getRange("A4:B9").format.rowHeight = 34;
instructions.getRange("A11:B14").values = [
  ["Example field", "Example value"],
  ["Document Number", "CRX-PRO-PFD-0001"],
  ["Planned Submission Date", "2026-09-30"],
  ["Progress Weight", 1],
];
instructions.getRange("A11:B11").format = { fill: "#E8733F", font: { bold: true, color: "#FFFFFF" } };

allowed.showGridLines = false;
allowed.getRange("A1:C1").values = [["Common Disciplines", "Common Document Types", "Issue Statuses"]];
allowed.getRange("A1:C1").format = { fill: "#10243E", font: { bold: true, color: "#FFFFFF" }, wrapText: true };
const maxRows = Math.max(disciplines.length, documentTypes.length, issueStatuses.length);
const allowedRows = Array.from({ length: maxRows }, (_, index) => [
  disciplines[index] ?? null,
  documentTypes[index] ?? null,
  issueStatuses[index] ?? null,
]);
allowed.getRange(`A2:C${maxRows + 1}`).values = allowedRows;
allowed.getRange(`A2:C${maxRows + 1}`).format = { borders: { preset: "inside", style: "thin", color: "#E4EBE7" }, wrapText: true };
allowed.getRange("A:B").format.columnWidth = 27;
allowed.getRange("C:C").format.columnWidth = 43;
allowed.freezePanes.freezeRows(1);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir("C:/Users/ahmed/Documents/EngiVault/apps/web/public/templates", { recursive: true });
const preview = await workbook.render({ sheetName: "MDR Import", range: "A1:L16", scale: 1, format: "png" });
await fs.writeFile(`${outputDir}/MDR-Import-Template-preview.png`, new Uint8Array(await preview.arrayBuffer()));
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(`${outputDir}/EngiCite-MDR-Import-Template.xlsx`);
await exported.save(publicPath);

const inspection = await workbook.inspect({
  kind: "table",
  range: "MDR Import!A1:L8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 12,
});
console.log(inspection.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);
