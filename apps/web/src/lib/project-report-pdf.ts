import {buildProjectReportPdf as buildLegacyProjectReportPdf} from "@/lib/project-report-pdf-legacy";
import {buildProjectReportPdfV2} from "@/lib/project-report-pdf-v2";

export {cleanPdfText,projectReportPdfFilename} from "@/lib/project-report-pdf-legacy";

/** Saved reports without an explicit layout marker retain their original renderer. */
export async function buildProjectReportPdf(input:Parameters<typeof buildLegacyProjectReportPdf>[0]){
  return input.snapshot.pdf_layout_version===2
    ? buildProjectReportPdfV2(input)
    : buildLegacyProjectReportPdf(input);
}
