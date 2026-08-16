import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "C:/Users/ahmed/Downloads/EngiCite-MDR-Import-Template (3).xlsx";
const outputDir = "C:/Users/ahmed/Documents/EngiVault/outputs/epcic_mdr_20260812";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const sheetSummary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 20,
  tableMaxCellChars: 140,
});
console.log("SUMMARY");
console.log(sheetSummary.ndjson);

const sheets = workbook.worksheets.items;
for (const sheet of sheets) {
  const used = sheet.getUsedRange();
  console.log(`SHEET ${sheet.name} USED ${used.address}`);
  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheet.name,
    range: used.address,
    maxChars: 14000,
    tableMaxRows: 40,
    tableMaxCols: 24,
    tableMaxCellChars: 180,
  });
  console.log(region.ndjson);

  const style = await workbook.inspect({
    kind: "computedStyle",
    sheetId: sheet.name,
    range: used.address,
    maxChars: 8000,
  });
  console.log("STYLES");
  console.log(style.ndjson);

  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  const safeName = sheet.name.replace(/[^a-z0-9_-]+/gi, "_");
  await fs.writeFile(`${outputDir}/template-${safeName}.png`, new Uint8Array(await preview.arrayBuffer()));
}
