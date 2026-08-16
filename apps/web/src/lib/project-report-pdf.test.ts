import {describe,expect,it} from "vitest";
import {PDFDocument} from "pdf-lib";
import {writeFile} from "node:fs/promises";
import {buildProjectReportPdf,cleanPdfText,projectReportPdfFilename} from "./project-report-pdf";

const snapshot={
  identity:{organisation_name:"Example Engineering",project_code:"PRJ-100",project_name:"Terminal Upgrade Project",client_name:"Example Client",facility_location:"Bonny Terminal",project_introduction:"Upgrade the terminal systems and issue controlled engineering deliverables.",key_objectives:["Complete design reviews","Issue approved deliverables"],planned_start_date:"2026-07-01",planned_end_date:"2026-12-20",client_logo_count:0,delivery_stage:"feed",terminal_issue_status:"Issued for Design (IFD)"},
  summary:{overall_progress:25,previous_progress:20,progress_gain:5,planned_deliverables:20,completed_deliverables:5,total_deliverables:20,uploaded_deliverables:12,approved_deliverables:5,overdue_deliverables:2,weekly_submissions:3,weekly_acceptances:2,weekly_due:4},
  disciplines:[{discipline:"Process",planned:10,completed:3,submitted_to_date:3,planned_this_week:2,issued_this_week:1,weekly_variance:-1,project_variance:-2,cumulative_planned:5,planned_completion:50,actual_completion:30,total:10,uploaded:7,approved:3,overdue:1,progress:30,weekly_submissions:2,weekly_acceptances:1},{discipline:"Mechanical",planned:10,completed:2,submitted_to_date:2,planned_this_week:1,issued_this_week:1,weekly_variance:0,project_variance:-2,cumulative_planned:4,planned_completion:40,actual_completion:20,total:10,uploaded:5,approved:2,overdue:1,progress:20,weekly_submissions:1,weekly_acceptances:1}],
  discipline_columns:["planned","submitted_to_date","planned_this_week","issued_this_week","weekly_variance","project_variance","planned_completion","actual_completion","issued_this_week_percent","weekly_variance_percent","cumulative_variance_percent"],
  weekly_issued_deliverables:[{document_number:"PRJ-PRO-000",title:"Process flow diagram",discipline:"Process",revision_code:"R01",issue_status:"Issued for review",issued_at:"2026-08-10T14:00:00Z"}],
  lookahead:[{document_number:"PRJ-PRO-001",title:"Process design basis",discipline:"Process",responsible_party:"Process team",planned_submission_date:"2026-08-15",required_issue_status:"Issued for review"}],
  challenges:[{title:"Vendor data pending",description:"Required pump data has not been received.",severity:"high",status:"open",owner_name:"Project Engineer",due_date:"2026-08-18"}],
  s_curve:{overall:[{date:"2026-07-01",planned:0,completed:0},{date:"2026-07-15",planned:4,completed:1},{date:"2026-07-29",planned:9,completed:2},{date:"2026-08-12",planned:14,completed:5},{date:"2026-08-26",planned:20,completed:null}],disciplines:[{discipline:"Mechanical",planned:10,completed:2,variance:-8,completion_percent:20},{discipline:"Process",planned:10,completed:3,variance:-7,completion_percent:30}]},
} as const;

describe("project report PDF",()=>{
  it("normalises unsupported punctuation for standard PDF fonts",()=>expect(cleanPdfText("Week one — progress · review…")).toBe("Week one - progress  |  review..."));
  it("creates a controlled filename",()=>expect(projectReportPdfFilename("PRJ 100/A",7)).toBe("PRJ-100-A-PCR-0007.pdf"));
  it("creates a readable multipage PDF",async()=>{
    const bytes=await buildProjectReportPdf({snapshot:{...snapshot,identity:{...snapshot.identity,key_objectives:[...snapshot.identity.key_objectives]},disciplines:snapshot.disciplines.map(item=>({...item})),discipline_columns:[...snapshot.discipline_columns],weekly_issued_deliverables:snapshot.weekly_issued_deliverables.map(item=>({...item})),lookahead:snapshot.lookahead.map(item=>({...item})),challenges:snapshot.challenges.map(item=>({...item})),s_curve:{overall:snapshot.s_curve.overall.map(item=>({...item})),disciplines:snapshot.s_curve.disciplines.map(item=>({...item}))}},report:{reportNumber:7,periodStart:"2026-08-06",periodEnd:"2026-08-12",generationSource:"manual",generatedAt:"2026-08-12T12:00:00Z"}});
    expect(String.fromCharCode(...bytes.slice(0,5))).toBe("%PDF-");
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    if(process.env.PROJECT_REPORT_PDF_OUTPUT)await writeFile(process.env.PROJECT_REPORT_PDF_OUTPUT,bytes);
  });
});
