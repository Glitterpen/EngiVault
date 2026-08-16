import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/ahmed/Documents/EngiVault/outputs/ctr_concept_study_20260812";
const outputPath = `${outputDir}/CTR-Concept-Screening-Structural-Study-USD-30000.xlsx`;

const NAVY = "#10243E";
const GREEN = "#0C5B45";
const ORANGE = "#F2773D";
const LIGHT_GREEN = "#F1F7F4";
const LIGHT_ORANGE = "#FFF2EA";
const LIGHT_GREY = "#F5F7FA";
const BORDER = "#DCE6E1";
const TEXT = "#23374D";
const MUTED = "#617083";
const WHITE = "#FFFFFF";

const deliverables = [
  ["C-01", "Design Basis Memorandum", "W1", "Study Lead / Lead Structural Engineer", "Medium", 1500, "Codes, criteria, inputs, interfaces and governing assumptions formally defined."],
  ["C-02", "Concept Screening & Selection – note and matrix", "W2", "Lead Structural Engineer", "High", 2200, "Screening matrix records the alternatives, criteria, scoring, recommendation and rationale."],
  ["C-03", "Preliminary Load Screening – LC1 to LC10", "W3", "Structural Engineer", "High", 2800, "LC1–LC10 are screened and governing conceptual load cases are identified."],
  ["C-04", "Preliminary Structural Sizing", "W3", "Lead Structural Engineer", "High", 2200, "Primary members are sized to conceptual level with governing checks and assumptions."],
  ["C-05", "Preliminary Foundation Assessment – mud mat bearing/sliding", "W4", "Lead Structural Engineer", "High", 2400, "Mud-mat bearing and sliding capacity are assessed using the agreed preliminary soil basis."],
  ["C-06", "Certification Strategy & Certifiability", "W5", "Certification Specialist", "High", 2300, "Applicable rules, certification path, review gates and certifiability risks are documented."],
  ["C-07", "Conceptual General Arrangement", "W4", "Lead Structural Engineer / CAD Designer", "High", 2300, "Conceptual GA shows major dimensions, elevations, access, interfaces and principal components."],
  ["C-08", "Installation Concept – rig-based", "W4", "Marine / Installation Engineer", "Medium", 1800, "Rig-based installation sequence, lifts, interfaces, constraints and prerequisites are defined."],
  ["C-09", "Order-of-Magnitude EPC Estimate – Class 5/4", "W5", "Cost Estimator", "High", 2000, "Estimate includes basis, conceptual quantities, exclusions, allowances and accuracy statement."],
  ["C-10", "Preliminary Weight Estimate / CoG", "W5", "Structural Engineer", "Medium", 1500, "Weight summary and preliminary centre-of-gravity basis are provided by major component."],
  ["C-11", "Cathodic Protection Strategy – 5-year basis", "W5", "Corrosion / CP Engineer", "Medium", 1400, "Five-year CP philosophy, current-demand basis, anode concept and interfaces are documented."],
  ["C-12", "Navigation Marking Concept – light/foghorn/solar", "W4", "Marine / Installation Engineer", "Medium", 1200, "Concept defines light, foghorn, solar supply, battery autonomy and installation interfaces."],
  ["C-13", "Consolidated Conceptual Study Report – FR/EN", "W6", "Study Lead / Bilingual Technical Editor", "High", 5500, "Final French and English report consolidates the selected concept, analyses and recommendations."],
  ["C-14", "Risk & Assumptions Register", "W6", "Study Lead", "Medium", 900, "Controlled register captures key risks, assumptions, owners, actions and close-out status."],
];

const resources = [
  ["Project Manager / Study Lead", 160, 20, "Leadership, planning, client interface, technical integration and final approval."],
  ["Lead Structural Engineer", 150, 70, "Concept selection, design basis, structural sizing, foundation assessment and technical assurance."],
  ["Structural Engineer", 110, 58, "Load screening, calculations, weight/CoG development and report inputs."],
  ["Marine / Installation Engineer", 130, 24, "Rig-based installation concept and navigation marking interfaces."],
  ["Certification Specialist", 140, 14, "Certification strategy, applicable requirements and certifiability review."],
  ["Cost Estimator", 100, 14, "Class 5/4 EPC estimate basis, quantities, allowances and estimate compilation."],
  ["Corrosion / CP Engineer", 120, 8, "Five-year cathodic-protection strategy and conceptual sizing basis."],
  ["CAD Designer", 75, 24, "Conceptual general arrangement and supporting report graphics."],
  ["Bilingual Technical Editor", 80, 4, "FR/EN final-report consistency and technical editing."],
  ["Document Controller", 60, 6, "Deliverable register, issue control, transmittal and final compilation."],
];

const assumptions = [
  "Currency is USD. The USD 30,000 price is a lump-sum professional-services budget exclusive of VAT, withholding tax, duties and other statutory charges.",
  "The programme is six consecutive weeks from notice to proceed and receipt of the minimum required client data.",
  "The price includes one consolidated client review cycle per deliverable and one final incorporation of agreed comments.",
  "The client will provide available site, metocean, geotechnical, rig-interface and existing-facility information. Data gaps will be treated as documented assumptions.",
  "The work is conceptual. Detailed finite-element analysis, fabrication drawings, detailed connection design, new surveys and geotechnical investigation are excluded.",
  "C-06 covers certification strategy and certifiability assessment only. Independent certifying authority fees and third-party review charges are excluded.",
  "C-09 is an order-of-magnitude Class 5/4 EPC estimate based on conceptual quantities and stated allowances; the estimate basis will define its accuracy and exclusions.",
  "French/English coverage applies to the consolidated report C-13. Supporting calculations and working documents are issued in English unless otherwise agreed.",
  "Travel, offshore attendance, physical inspection, testing and site supervision are excluded unless added by written variation.",
  "Commercial allocations by deliverable are planning values and do not constitute independently severable unit prices.",
];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("CTR Summary");
const detail = workbook.worksheets.add("CTR Detail");
const resource = workbook.worksheets.add("Resource Plan");
const weekly = workbook.worksheets.add("Weekly Plan");

for (const sheet of [summary, detail, resource, weekly]) {
  sheet.showGridLines = false;
}

// Resource Plan (built before formulas that depend on its totals)
resource.getRange("A1:F2").merge();
resource.getRange("A1").values = [["RESOURCE LOADING & COST BASIS"]];
resource.getRange("A1:F2").format = { fill: NAVY, font: { bold: true, color: WHITE, fontSize: 18 }, verticalAlignment: "center" };
resource.getRange("A3:F3").merge();
resource.getRange("A3").values = [["Planned professional hours and charge-out rates supporting the fixed USD 30,000 CTR."]];
resource.getRange("A3:F3").format = { fill: LIGHT_GREEN, font: { italic: true, color: GREEN }, verticalAlignment: "center" };
resource.getRange("A5:F5").values = [["Role", "Rate (USD/hr)", "Planned Hours", "Cost (USD)", "Cost Share", "Primary Responsibility"]];
resource.getRange("A6:F15").values = resources.map(([role, rate, hours, responsibility]) => [role, rate, hours, null, null, responsibility]);
resource.getRange("D6").formulas = [["=B6*C6"]];
resource.getRange("D6:D15").fillDown();
resource.getRange("E6").formulas = [["=D6/$D$16"]];
resource.getRange("E6:E15").fillDown();
resource.getRange("A16:F16").values = [["TOTAL", null, null, null, null, ""]];
resource.getRange("C16").formulas = [["=SUM(C6:C15)"]];
resource.getRange("D16").formulas = [["=SUM(D6:D15)"]];
resource.getRange("E16").formulas = [["=SUM(E6:E15)"]];
resource.getRange("A5:F5").format = { fill: GREEN, font: { bold: true, color: WHITE }, wrapText: true, verticalAlignment: "center" };
resource.getRange("A6:F15").format = { font: { color: TEXT }, wrapText: true, verticalAlignment: "center", borders: { insideHorizontal: { style: "thin", color: BORDER } } };
resource.getRange("A16:F16").format = { fill: LIGHT_ORANGE, font: { bold: true, color: NAVY }, borders: { top: { style: "medium", color: ORANGE }, bottom: { style: "double", color: ORANGE } } };
resource.getRange("B6:B16").setNumberFormat("$#,##0");
resource.getRange("C6:C16").setNumberFormat("#,##0");
resource.getRange("D6:D16").setNumberFormat("$#,##0");
resource.getRange("E6:E16").setNumberFormat("0.0%");
resource.getRange("A1:F16").format.font = { name: "Aptos" };
resource.getRange("A1:A16").format.columnWidth = 30;
resource.getRange("B1:B16").format.columnWidth = 16;
resource.getRange("C1:C16").format.columnWidth = 16;
resource.getRange("D1:D16").format.columnWidth = 16;
resource.getRange("E1:E16").format.columnWidth = 14;
resource.getRange("F1:F16").format.columnWidth = 55;
resource.getRange("A6:F15").format.autofitRows();
resource.freezePanes.freezeRows(5);
const resourceTable = resource.tables.add("A5:F15", true, "ResourcePlanTable");
resourceTable.style = "TableStyleMedium4";

// CTR Detail
detail.getRange("A1:I2").merge();
detail.getRange("A1").values = [["COST–TIME–RESOURCE DETAIL"]];
detail.getRange("A1:I2").format = { fill: NAVY, font: { bold: true, color: WHITE, fontSize: 18 }, verticalAlignment: "center" };
detail.getRange("A3:I3").merge();
detail.getRange("A3").values = [["Commercial allocation and acceptance basis for the six-week conceptual engineering study."]];
detail.getRange("A3:I3").format = { fill: LIGHT_GREEN, font: { italic: true, color: GREEN }, verticalAlignment: "center" };
detail.getRange("A5:I5").values = [["Code", "Deliverable", "Due Week", "Lead Resource", "Complexity", "Cost Allocation (USD)", "Budget Share", "Equivalent Hours", "Deliverable / Acceptance Basis"]];
detail.getRange("A6:I19").values = deliverables.map(([code, title, week, lead, complexity, cost, basis]) => [code, title, week, lead, complexity, cost, null, null, basis]);
detail.getRange("A20:I20").values = [["TOTAL", "14 deliverables", "W1–W6", "", "", null, null, null, ""]];
detail.getRange("F20").formulas = [["=SUM(F6:F19)"]];
detail.getRange("G20").formulas = [["=SUM(G6:G19)"]];
detail.getRange("H20").formulas = [["=SUM(H6:H19)"]];
detail.getRange("G6").formulas = [["=F6/$F$20"]];
detail.getRange("G6:G19").fillDown();
detail.getRange("H6").formulas = [["=F6/'CTR Summary'!$F$9"]];
detail.getRange("H6:H19").fillDown();
detail.getRange("A5:I5").format = { fill: GREEN, font: { bold: true, color: WHITE }, wrapText: true, verticalAlignment: "center" };
detail.getRange("A6:I19").format = { font: { color: TEXT }, wrapText: true, verticalAlignment: "center", borders: { insideHorizontal: { style: "thin", color: BORDER } } };
detail.getRange("A20:I20").format = { fill: LIGHT_ORANGE, font: { bold: true, color: NAVY }, borders: { top: { style: "medium", color: ORANGE }, bottom: { style: "double", color: ORANGE } } };
detail.getRange("F6:F20").setNumberFormat("$#,##0");
detail.getRange("G6:G20").setNumberFormat("0.0%");
detail.getRange("H6:H20").setNumberFormat("0.0");
detail.getRange("F6:F19").conditionalFormats.add("dataBar", { color: ORANGE, gradient: true });
detail.getRange("A1:I20").format.font = { name: "Aptos" };
detail.getRange("A1:A20").format.columnWidth = 10;
detail.getRange("B1:B20").format.columnWidth = 45;
detail.getRange("C1:C20").format.columnWidth = 11;
detail.getRange("D1:D20").format.columnWidth = 34;
detail.getRange("E1:E20").format.columnWidth = 12;
detail.getRange("F1:F20").format.columnWidth = 20;
detail.getRange("G1:G20").format.columnWidth = 15;
detail.getRange("H1:H20").format.columnWidth = 17;
detail.getRange("I1:I20").format.columnWidth = 67;
detail.getRange("A6:I19").format.autofitRows();
detail.freezePanes.freezeRows(5);
const detailTable = detail.tables.add("A5:I19", true, "CTRDetailTable");
detailTable.style = "TableStyleMedium4";

// Weekly Plan
weekly.getRange("A1:J2").merge();
weekly.getRange("A1").values = [["SIX-WEEK DELIVERY & COMMERCIAL CURVE"]];
weekly.getRange("A1:J2").format = { fill: NAVY, font: { bold: true, color: WHITE, fontSize: 18 }, verticalAlignment: "center" };
weekly.getRange("A4:F4").values = [["Week", "Milestone Objective", "Deliverables Due", "Weekly Allocation", "Cumulative Allocation", "Cumulative %"]];
weekly.getRange("A5:A10").values = [["W1"], ["W2"], ["W3"], ["W4"], ["W5"], ["W6"]];
weekly.getRange("B5:B10").values = [
  ["Basis confirmed and study mobilisation complete"],
  ["Concept alternatives screened and selected"],
  ["Load screening and preliminary structural sizing complete"],
  ["Foundation, GA, installation and navigation concepts complete"],
  ["Certification, EPC estimate, weight/CoG and CP strategy complete"],
  ["Bilingual consolidated report and controlled risk register issued"],
];
weekly.getRange("C5").formulas = [["=COUNTIF('CTR Detail'!$C$6:$C$19,A5)"]];
weekly.getRange("C5:C10").fillDown();
weekly.getRange("D5").formulas = [["=SUMIF('CTR Detail'!$C$6:$C$19,A5,'CTR Detail'!$F$6:$F$19)"]];
weekly.getRange("D5:D10").fillDown();
weekly.getRange("E5").formulas = [["=D5"]];
weekly.getRange("E6").formulas = [["=E5+D6"]];
weekly.getRange("E6:E10").fillDown();
weekly.getRange("F5").formulas = [["=E5/'CTR Summary'!$F$7"]];
weekly.getRange("F5:F10").fillDown();
weekly.getRange("A11:F11").values = [["TOTAL", "", null, null, null, null]];
weekly.getRange("C11").formulas = [["=SUM(C5:C10)"]];
weekly.getRange("D11").formulas = [["=SUM(D5:D10)"]];
weekly.getRange("E11").formulas = [["=E10"]];
weekly.getRange("F11").formulas = [["=F10"]];
weekly.getRange("A4:F4").format = { fill: GREEN, font: { bold: true, color: WHITE }, wrapText: true, verticalAlignment: "center" };
weekly.getRange("A5:F10").format = { font: { color: TEXT }, wrapText: true, verticalAlignment: "center", borders: { insideHorizontal: { style: "thin", color: BORDER } } };
weekly.getRange("A11:F11").format = { fill: LIGHT_ORANGE, font: { bold: true, color: NAVY }, borders: { top: { style: "medium", color: ORANGE }, bottom: { style: "double", color: ORANGE } } };
weekly.getRange("D5:E11").setNumberFormat("$#,##0");
weekly.getRange("F5:F11").setNumberFormat("0.0%");
weekly.getRange("H4:J4").values = [["Week", "Weekly Cost", "Cumulative Cost"]];
weekly.getRange("H5").formulas = [["=A5"]];
weekly.getRange("H5:H10").fillDown();
weekly.getRange("I5").formulas = [["=D5"]];
weekly.getRange("I5:I10").fillDown();
weekly.getRange("J5").formulas = [["=E5"]];
weekly.getRange("J5:J10").fillDown();
weekly.getRange("H4:J10").format = { fill: LIGHT_GREY, font: { color: TEXT }, borders: { preset: "all", style: "thin", color: BORDER } };
weekly.getRange("H4:J4").format = { fill: GREEN, font: { bold: true, color: WHITE } };
weekly.getRange("I5:J10").setNumberFormat("$#,##0");
const weeklyChart = weekly.charts.add("line", weekly.getRange("H4:J10"));
weeklyChart.title = "Weekly and Cumulative Commercial Curve (USD)";
weeklyChart.hasLegend = true;
weeklyChart.xAxis = { axisType: "textAxis", textStyle: { fontSize: 10 } };
weeklyChart.yAxis = { numberFormatCode: "$#,##0", min: 0, max: 30000 };
weeklyChart.setPosition("A13", "G29");
weekly.getRange("A1:J29").format.font = { name: "Aptos" };
weekly.getRange("A1:A11").format.columnWidth = 10;
weekly.getRange("B1:B11").format.columnWidth = 58;
weekly.getRange("C1:C11").format.columnWidth = 17;
weekly.getRange("D1:E11").format.columnWidth = 21;
weekly.getRange("F1:F11").format.columnWidth = 17;
weekly.getRange("H1:H10").format.columnWidth = 10;
weekly.getRange("I1:J10").format.columnWidth = 19;
weekly.getRange("A5:F10").format.autofitRows();
weekly.freezePanes.freezeRows(4);
const weeklyTable = weekly.tables.add("A4:F10", true, "WeeklyPlanTable");
weeklyTable.style = "TableStyleMedium4";

// Summary
summary.getRange("A1:H2").merge();
summary.getRange("A1").values = [["CTR – CONCEPT SCREENING & PRELIMINARY STRUCTURAL STUDY"]];
summary.getRange("A1:H2").format = { fill: NAVY, font: { bold: true, color: WHITE, fontSize: 20 }, verticalAlignment: "center" };
summary.getRange("A3:H3").merge();
summary.getRange("A3").values = [["Cost · Time · Resource Basis | Budgetary Issue – Rev 0"]];
summary.getRange("A3:H3").format = { fill: ORANGE, font: { bold: true, color: WHITE, fontSize: 11 }, verticalAlignment: "center" };
summary.getRange("A5:B5").merge();
summary.getRange("A5").values = [["COMMERCIAL BASIS"]];
summary.getRange("A5:B5").format = { fill: GREEN, font: { bold: true, color: WHITE } };
summary.getRange("A6:B11").values = [
  ["Currency", "USD"],
  ["Contract basis", "Lump sum"],
  ["Study duration", "6 weeks"],
  ["Issue", "Budgetary CTR – Rev 0"],
  ["Deliverables", null],
  ["Programme basis", "NTP + complete client data"],
];
summary.getRange("B10").formulas = [["=COUNTA('CTR Detail'!A6:A19)"]];
summary.getRange("A6:A11").format = { fill: LIGHT_GREY, font: { bold: true, color: NAVY }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("B6:B11").format = { font: { color: TEXT }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("D5:H5").merge();
summary.getRange("D5").values = [["CONTROL TOTALS"]];
summary.getRange("D5:H5").format = { fill: GREEN, font: { bold: true, color: WHITE } };
summary.getRange("D6:E6").merge();
summary.getRange("D6").values = [["Total Budget"]];
summary.getRange("F6:H6").merge();
summary.getRange("F6").formulas = [["='Resource Plan'!D16"]];
summary.getRange("D7:E7").merge();
summary.getRange("D7").values = [["Commercial Check"]];
summary.getRange("F7:H7").merge();
summary.getRange("F7").formulas = [["='CTR Detail'!F20"]];
summary.getRange("D8:E8").merge();
summary.getRange("D8").values = [["Planned Hours"]];
summary.getRange("F8:H8").merge();
summary.getRange("F8").formulas = [["='Resource Plan'!C16"]];
summary.getRange("D9:E9").merge();
summary.getRange("D9").values = [["Blended Rate"]];
summary.getRange("F9:H9").merge();
summary.getRange("F9").formulas = [["=F6/F8"]];
summary.getRange("D10:E10").merge();
summary.getRange("D10").values = [["Budget Variance"]];
summary.getRange("F10:H10").merge();
summary.getRange("F10").formulas = [["=F7-F6"]];
summary.getRange("D11:E11").merge();
summary.getRange("D11").values = [["Deliverables"]];
summary.getRange("F11:H11").merge();
summary.getRange("F11").formulas = [["=COUNTA('CTR Detail'!A6:A19)"]];
summary.getRange("D6:E11").format = { fill: LIGHT_GREY, font: { bold: true, color: NAVY }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("F6:H11").format = { font: { bold: true, color: TEXT, fontSize: 13 }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("F6:H7").setNumberFormat("$#,##0");
summary.getRange("F8:H8").setNumberFormat("#,##0");
summary.getRange("F9:H10").setNumberFormat("$#,##0.00");
summary.getRange("A13:E13").merge();
summary.getRange("A13").values = [["WEEKLY COMMERCIAL CURVE"]];
summary.getRange("A13:E13").format = { fill: GREEN, font: { bold: true, color: WHITE } };
summary.getRange("A14:E14").values = [["Week", "Deliverables Due", "Weekly Allocation", "Cumulative Allocation", "Cumulative %"]];
summary.getRange("A14:E14").format = { fill: NAVY, font: { bold: true, color: WHITE }, wrapText: true };
summary.getRange("A15:A20").values = [["W1"], ["W2"], ["W3"], ["W4"], ["W5"], ["W6"]];
summary.getRange("B15").formulas = [["='Weekly Plan'!C5"]];
summary.getRange("B15:B20").fillDown();
summary.getRange("C15").formulas = [["='Weekly Plan'!D5"]];
summary.getRange("C15:C20").fillDown();
summary.getRange("D15").formulas = [["='Weekly Plan'!E5"]];
summary.getRange("D15:D20").fillDown();
summary.getRange("E15").formulas = [["='Weekly Plan'!F5"]];
summary.getRange("E15:E20").fillDown();
summary.getRange("A15:E20").format = { font: { color: TEXT }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("C15:D20").setNumberFormat("$#,##0");
summary.getRange("E15:E20").setNumberFormat("0.0%");
summary.getRange("G13:H13").merge();
summary.getRange("G13").values = [["BUDGET CHECK"]];
summary.getRange("G13:H13").format = { fill: GREEN, font: { bold: true, color: WHITE } };
summary.getRange("G14:G17").values = [["CTR Detail"], ["Resource Plan"], ["Variance"], ["Status"]];
summary.getRange("H14").formulas = [["='CTR Detail'!F20"]];
summary.getRange("H15").formulas = [["='Resource Plan'!D16"]];
summary.getRange("H16").formulas = [["=H14-H15"]];
summary.getRange("H17").formulas = [["=IF(H16=0,\"BALANCED\",\"REVIEW\")"]];
summary.getRange("G14:G17").format = { fill: LIGHT_GREY, font: { bold: true, color: NAVY }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("H14:H17").format = { font: { bold: true, color: TEXT }, borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("H14:H16").setNumberFormat("$#,##0.00");
summary.getRange("H17").format = { fill: LIGHT_GREEN, font: { bold: true, color: GREEN }, horizontalAlignment: "center" };
summary.getRange("A22:H22").merge();
summary.getRange("A22").values = [["COMMERCIAL & EXECUTION ASSUMPTIONS"]];
summary.getRange("A22:H22").format = { fill: GREEN, font: { bold: true, color: WHITE } };
for (let i = 0; i < assumptions.length; i++) {
  const row = 23 + i;
  summary.getRange(`A${row}`).values = [[i + 1]];
  summary.getRange(`B${row}:H${row}`).merge();
  summary.getRange(`B${row}`).values = [[assumptions[i]]];
}
summary.getRange("A23:A32").format = { fill: LIGHT_ORANGE, font: { bold: true, color: ORANGE }, horizontalAlignment: "center", verticalAlignment: "top", borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("B23:H32").format = { font: { color: TEXT }, wrapText: true, verticalAlignment: "top", borders: { insideHorizontal: { style: "thin", color: BORDER } } };
summary.getRange("A34:B34").merge();
summary.getRange("A34").values = [["Prepared by"]];
summary.getRange("C34:D34").merge();
summary.getRange("C34").values = [["Checked by"]];
summary.getRange("E34:F34").merge();
summary.getRange("E34").values = [["Approved by"]];
summary.getRange("G34:H34").merge();
summary.getRange("G34").values = [["Date"]];
summary.getRange("A34:H34").format = { fill: NAVY, font: { bold: true, color: WHITE }, horizontalAlignment: "center" };
summary.getRange("A35:B36").merge();
summary.getRange("C35:D36").merge();
summary.getRange("E35:F36").merge();
summary.getRange("G35:H36").merge();
summary.getRange("A35:H36").format = { fill: WHITE, borders: { preset: "all", style: "thin", color: BORDER } };
summary.getRange("A1:H36").format.font = { name: "Aptos" };
summary.getRange("A1:A36").format.columnWidth = 20;
summary.getRange("B1:B36").format.columnWidth = 23;
summary.getRange("C1:C36").format.columnWidth = 18;
summary.getRange("D1:D36").format.columnWidth = 20;
summary.getRange("E1:E36").format.columnWidth = 17;
summary.getRange("F1:F36").format.columnWidth = 17;
summary.getRange("G1:G36").format.columnWidth = 16;
summary.getRange("H1:H36").format.columnWidth = 19;
summary.getRange("A23:H32").format.autofitRows();
summary.freezePanes.freezeRows(3);

// Final verification and export
await fs.mkdir(outputDir, { recursive: true });
const keyCheck = await workbook.inspect({
  kind: "table",
  range: "CTR Summary!D5:H17",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
  maxChars: 12000,
});
console.log("SUMMARY CHECK");
console.log(keyCheck.ndjson);

const detailCheck = await workbook.inspect({
  kind: "table",
  range: "CTR Detail!A5:I20",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 9,
  maxChars: 16000,
});
console.log("DETAIL CHECK");
console.log(detailCheck.ndjson);

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "CTR formula error scan",
});
console.log(errorScan.ndjson);

for (const [sheetName, range] of [
  ["CTR Summary", "A1:H36"],
  ["CTR Detail", "A1:I20"],
  ["Resource Plan", "A1:F16"],
  ["Weekly Plan", "A1:J29"],
]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.5, format: "png" });
  await fs.writeFile(`${outputDir}/${sheetName.replace(/\s+/g, "-")}.png`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

const savedWorkbook = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const savedTotals = await savedWorkbook.inspect({
  kind: "table",
  range: "Resource Plan!A15:E16",
  include: "values,formulas",
  tableMaxRows: 5,
  tableMaxCols: 5,
  maxChars: 4000,
});
console.log("SAVED FILE CHECK");
console.log(savedTotals.ndjson);
console.log(JSON.stringify({ outputPath, deliverables: deliverables.length, budget: 30000, weeks: 6, plannedHours: 242 }, null, 2));
