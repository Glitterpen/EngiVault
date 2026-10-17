import {beforeEach,describe,expect,it,vi} from "vitest";
import {projectReportSnapshotSchema} from "@/lib/project-report";

const builders=vi.hoisted(()=>({legacy:vi.fn(),current:vi.fn()}));
vi.mock("@/lib/project-report-pdf-legacy",()=>({
  buildProjectReportPdf:builders.legacy,
  cleanPdfText:(value:unknown)=>String(value??""),
  projectReportPdfFilename:()=>"report.pdf",
}));
vi.mock("@/lib/project-report-pdf-v2",()=>({buildProjectReportPdfV2:builders.current}));

import {buildProjectReportPdf} from "@/lib/project-report-pdf";

describe("future-only project report PDF layout",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    builders.legacy.mockResolvedValue(new Uint8Array([1]));
    builders.current.mockResolvedValue(new Uint8Array([2]));
  });

  it.each([undefined,1,null,"2",true,3])("keeps existing reports on the legacy renderer (marker %s)",async (marker:unknown)=>{
    const input={snapshot:marker===undefined?{}:{pdf_layout_version:marker},report:{}} as Parameters<typeof buildProjectReportPdf>[0];
    expect(await buildProjectReportPdf(input)).toEqual(new Uint8Array([1]));
    expect(builders.legacy).toHaveBeenCalledWith(input);
    expect(builders.current).not.toHaveBeenCalled();
  });

  it("uses the redesign only for the explicit new-capture marker",async()=>{
    const input={snapshot:{pdf_layout_version:2},report:{}} as Parameters<typeof buildProjectReportPdf>[0];
    const before=structuredClone(input);
    expect(await buildProjectReportPdf(input)).toEqual(new Uint8Array([2]));
    expect(builders.current).toHaveBeenCalledWith(input);
    expect(builders.legacy).not.toHaveBeenCalled();
    expect(input).toEqual(before);
  });

  it("does not manufacture or coerce a layout marker while reading a saved snapshot",()=>{
    const schema=projectReportSnapshotSchema.shape.pdf_layout_version;
    expect(schema.parse(undefined)).toBeUndefined();
    expect(schema.parse(1)).toBe(1);
    expect(schema.parse(2)).toBe(2);
    expect(schema.parse("2")).toBe("2");
    expect(schema.parse(null)).toBeNull();
    expect(schema.parse(3)).toBe(3);
  });

  it.each([undefined,null,"2",true,3,{legacy:"metadata"},2])("keeps full saved snapshots readable and dispatches strictly (marker %s)",async (marker:unknown)=>{
    const stored={
      ...(marker===undefined?{}:{pdf_layout_version:marker}),
      identity:{organisation_name:"Example",project_code:"PRJ-1",project_name:"Project",client_name:null,facility_location:null,project_introduction:null,key_objectives:[],planned_start_date:null,planned_end_date:null,client_logo_count:0},
      summary:{overall_progress:20,previous_progress:null,progress_gain:null,total_deliverables:5,uploaded_deliverables:2,approved_deliverables:1,overdue_deliverables:0,weekly_submissions:0,weekly_acceptances:0,weekly_due:0},
      disciplines:[],lookahead:[],challenges:[],
    };
    const before=structuredClone(stored),snapshot=projectReportSnapshotSchema.parse(stored);
    expect(snapshot.summary.overall_progress).toBe(20);
    expect(snapshot.pdf_layout_version).toEqual(marker);
    await buildProjectReportPdf({snapshot,report:{reportNumber:1,periodStart:"2026-10-01",periodEnd:"2026-10-07",generationSource:"manual",generatedAt:"2026-10-07T12:00:00Z"}});
    expect(marker===2?builders.current:builders.legacy).toHaveBeenCalledOnce();
    expect(marker===2?builders.legacy:builders.current).not.toHaveBeenCalled();
    expect(stored).toEqual(before);
  });
});
