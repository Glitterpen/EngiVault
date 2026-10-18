import {afterEach,describe,expect,it,vi} from "vitest";
import {PDFDocument,PDFPage,rgb,type PDFPageDrawTextOptions} from "pdf-lib";
import {mkdir,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {buildProjectReportPdfV2} from "./project-report-pdf-v2";
import {DEFAULT_DISCIPLINE_REPORT_COLUMNS,type ProjectReportSnapshot} from "./project-report";
import {PDF_COLOR_TEMPLATES} from "./pdf-color-template";

const report={reportNumber:7,periodStart:"2026-10-08",periodEnd:"2026-10-14",generationSource:"manual",generatedAt:"2026-10-17T12:00:00Z"};
function snapshot():ProjectReportSnapshot{
  return {
    identity:{organisation_name:"Example Engineering",project_code:"LAYOUT-PREVIEW-01",project_name:"LAYOUT PREVIEW - NOT ISSUED",client_name:"Example Client",facility_location:"Example terminal",project_introduction:"Improve the terminal systems and issue controlled engineering deliverables.",key_objectives:["Complete design reviews","Issue approved deliverables"],planned_start_date:"2026-07-01",planned_end_date:"2026-12-20",client_logo_count:0,delivery_stage:"feed",terminal_issue_status:"Issued for Design (IFD)"},
    summary:{overall_progress:50,previous_progress:45,progress_gain:5,planned_deliverables:100,completed_deliverables:40,total_deliverables:100,uploaded_deliverables:65,approved_deliverables:40,overdue_deliverables:2,weekly_submissions:3,weekly_acceptances:2,weekly_due:4},
    disciplines:[{discipline:"Process",planned:50,completed:20,submitted_to_date:35,planned_this_week:2,issued_this_week:1,weekly_variance:-1,project_variance:-2,cumulative_planned:37,planned_completion:74,actual_completion:50,total:50,uploaded:32,approved:20,overdue:1,progress:50,weekly_submissions:2,weekly_acceptances:1}],
    discipline_columns:[...DEFAULT_DISCIPLINE_REPORT_COLUMNS],
    weekly_issued_deliverables:[{document_number:"PREVIEW-PRO-001",title:"Process flow diagram",discipline:"Process",revision_code:"R01",issue_status:"Issued for Review (IFR)",issued_at:"2026-10-12T14:00:00Z"}],
    lookahead:[{document_number:"PREVIEW-PRO-002",title:"Process design basis",discipline:"Process",responsible_party:"Process team",planned_submission_date:"2026-10-19",required_issue_status:"Issued for Design (IFD)"}],
    challenges:[{title:"Vendor data pending",description:"Required pump data has not been received.",severity:"high",status:"open",owner_name:"Project Engineer",due_date:"2026-10-20"}],
    s_curve:{overall:[{date:"2026-10-07",planned:40,completed:44},{date:"2026-10-14",planned:55,completed:47},{date:"2026-10-21",planned:75,completed:null},{date:"2026-10-28",planned:100,completed:null}],disciplines:[{discipline:"Process",planned:50,completed:20,variance:-5,completion_percent:50}]},
  };
}
type Drawn={text:string;options:PDFPageDrawTextOptions;page:PDFPage};
function capture(){
  const drawn:Drawn[]=[];
  const original=PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype,"drawText").mockImplementation(function(this:PDFPage,value:string,options:PDFPageDrawTextOptions={}){drawn.push({text:value,options,page:this});return original.call(this,value,options);});
  return drawn;
}
function fullText(drawn:Drawn[]){return drawn.map(item=>item.text).join(" ").replace(/\s+/g," ");}
function checkBounds(drawn:Drawn[]){
  for(const item of drawn){
    const {x=0,y=0,size=12,font}=item.options;
    expect(y,`${item.text}: vertical position`).toBeGreaterThanOrEqual(23);
    expect(y,`${item.text}: vertical position`).toBeLessThanOrEqual(803);
    expect(x,`${item.text}: left edge`).toBeGreaterThanOrEqual(39);
    if(font)expect(x+font.widthOfTextAtSize(item.text,size),`${item.text}: right edge`).toBeLessThanOrEqual(556);
    if(y>40)expect(size,`${item.text}: content font size`).toBeGreaterThanOrEqual(8);
  }
}
async function savePreview(name:string,bytes:Uint8Array){
  if(!process.env.PROJECT_REPORT_PDF_V2_OUTPUT_DIR)return;
  await mkdir(process.env.PROJECT_REPORT_PDF_V2_OUTPUT_DIR,{recursive:true});
  await writeFile(join(process.env.PROJECT_REPORT_PDF_V2_OUTPUT_DIR,name),bytes);
}
afterEach(()=>vi.restoreAllMocks());

describe("future project-report PDF layout",()=>{
  it("draws approved milestones as steps and preserves actual and source snapshots",async()=>{
    const input=snapshot(),drawn=capture();
    input.s_curve.planning_baseline={version:1,basis:"approved_weighted_milestones",status:"approved",approved_baseline_id:null,approved_baseline_version:2,approved_at:null,scope_hash:null};
    input.s_curve.overall=input.s_curve.overall.map(point=>({...point,baseline_planned:point.planned}));
    input.s_curve.disciplines=input.s_curve.disciplines.map(row=>({...row,baseline_variance:row.variance}));
    input.disciplines=input.disciplines.map(row=>({...row,planning_baseline:input.s_curve.planning_baseline,baseline_plan:{planned_this_week:row.planned_this_week,weekly_variance:row.weekly_variance,project_variance:row.project_variance,cumulative_planned:row.cumulative_planned,planned_completion:row.planned_completion}}));
    const before=structuredClone(input),lines=vi.spyOn(PDFPage.prototype,"drawLine");
    const bytes=await buildProjectReportPdfV2({snapshot:input,report});
    expect(input).toEqual(before);
    expect(fullText(drawn)).toContain("Approved weighted milestone baseline v2.");
    const planLines=lines.mock.calls.map(([options])=>options).filter(options=>options?.dashArray?.join(",")==="5,3");
    expect(planLines.length).toBeGreaterThan(2);
    expect(planLines.every(options=>options?.start.x===options?.end.x||options?.start.y===options?.end.y)).toBe(true);
    checkBounds(drawn);
    await savePreview("report-approved-baseline-preview.pdf",bytes);
  });
  it("does not render a missing approved baseline as a zero plan",async()=>{
    const input=snapshot(),drawn=capture();
    input.s_curve.planning_baseline={version:1,basis:"approved_weighted_milestones",status:"missing",approved_baseline_id:null,approved_baseline_version:null,approved_at:null,scope_hash:null};
    input.s_curve.overall=input.s_curve.overall.map(point=>({...point,planned:0,baseline_planned:null}));
    input.s_curve.disciplines=input.s_curve.disciplines.map(row=>({...row,baseline_variance:null}));
    input.disciplines=input.disciplines.map(row=>({...row,planning_baseline:input.s_curve.planning_baseline,baseline_plan:{planned_this_week:null,weekly_variance:null,project_variance:null,cumulative_planned:null,planned_completion:null}}));
    input.summary.baseline_weekly_due=null;
    const bytes=await buildProjectReportPdfV2({snapshot:input,report});
    expect(fullText(drawn)).toContain("Approved plan unavailable.");
    expect(fullText(drawn)).toContain("Final milestones due: N/A");
    expect(fullText(drawn)).not.toContain("74%");
    checkBounds(drawn);
    await savePreview("report-unavailable-baseline-preview.pdf",bytes);
  });
  it("renders all five palettes per request without changing figures or leaking concurrent selections",async()=>{
    const drawn=capture();
    const rectangles:{page:PDFPage;options:Parameters<PDFPage["drawRectangle"]>[0]}[]=[];
    const original=PDFPage.prototype.drawRectangle;
    vi.spyOn(PDFPage.prototype,"drawRectangle").mockImplementation(function(this:PDFPage,options){rectangles.push({page:this,options});return original.call(this,options);});
    const inputs=PDF_COLOR_TEMPLATES.map(template=>{
      const value=snapshot();value.pdf_color_template=template.id;value.identity.project_code=`PALETTE-${template.id.toUpperCase()}`;value.identity.project_name=`PALETTE PREVIEW - NOT ISSUED - ${template.label}`;return value;
    });
    const originals=JSON.stringify(inputs);
    const outputs=await Promise.all(inputs.map(value=>buildProjectReportPdfV2({snapshot:value,report})));
    expect(JSON.stringify(inputs)).toBe(originals);
    for(const [index,template] of PDF_COLOR_TEMPLATES.entries()){
      const firstPage=drawn.find(item=>item.text===inputs[index].identity.project_code)!.page;
      const banner=rectangles.find(item=>item.page===firstPage&&item.options?.height===24)!;
      expect(banner.options?.color).toEqual(rgb(...template.palette.header.map(value=>value/255) as [number,number,number]));
      const value=fullText(drawn.filter(item=>item.page.doc===firstPage.doc));
      expect(value).toContain("Latest saved weekly actual: 47% at 14 Oct 2026. Snapshot completion: 50%");
      expect(value).toContain("PREVIEW-PRO-001");expect(value).toContain("PREVIEW-PRO-002");
      expect((await PDFDocument.load(outputs[index])).getPageCount()).toBe(3);
      await savePreview(`report-${template.id}-palette-preview.pdf`,outputs[index]);
    }
    checkBounds(drawn);
  });

  it.each([undefined,null,"unrecognised",true,{palette:"slate"}])("uses neutral for unknown saved palette metadata (%s)",async value=>{
    const input=snapshot();input.pdf_color_template=value;
    const rectangles=vi.spyOn(PDFPage.prototype,"drawRectangle");
    const before=structuredClone(input);await buildProjectReportPdfV2({snapshot:input,report});
    expect(input).toEqual(before);
    expect(rectangles.mock.calls.some(([options])=>options?.height===24&&JSON.stringify(options.color)===JSON.stringify(rgb(53/255,61/255,67/255)))).toBe(true);
  });

  it("keeps a captured summary separate from historical weekly figures and shows the chart early",async()=>{
    const drawn=capture(),input=snapshot(),before=JSON.stringify(input);
    const bytes=await buildProjectReportPdfV2({snapshot:input,report});
    const pdf=await PDFDocument.load(bytes);
    expect(JSON.stringify(input)).toBe(before);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const value=fullText(drawn);
    expect(value).toContain("50%");
    expect(value).toContain("Latest saved weekly actual: 47% at 14 Oct 2026. Snapshot completion: 50% captured 17 Oct 2026, 12:00 UTC.");
    expect(value).toContain("Reporting period: 08 Oct 2026 - 14 Oct 2026");
    expect(value).toContain("Plan: 07 Oct 2026 - 28 Oct 2026. Weekly actual through: 14 Oct 2026.");
    const pages=[...new Set(drawn.map(item=>item.page))];
    const chart=drawn.find(item=>item.text==="Project delivery S-curve")!;
    expect(pages.indexOf(chart.page)).toBeLessThanOrEqual(1);
    expect(drawn.findIndex(item=>item.text==="Project delivery S-curve")).toBeLessThan(drawn.findIndex(item=>item.text==="Discipline delivery position"));
    expect(drawn.find(item=>item.text==="PREVIEW-PRO-002")?.page).toBe(drawn.find(item=>item.text==="Process design basis")?.page);
    expect(drawn.filter(item=>item.text==="Planned date")).toHaveLength(1);
    expect(drawn.find(item=>item.text==="Planned deliverable submissions")?.page).toBe(drawn.find(item=>item.text==="PREVIEW-PRO-002")?.page);
    checkBounds(drawn);
    await savePreview("report-layout-v2-normal-preview.pdf",bytes);
  });

  it("retains all content in long flowing paragraphs, titles, registers and forty disciplines",async()=>{
    const drawn=capture(),input=snapshot();
    input.identity.project_name="LAYOUT PREVIEW - NOT ISSUED - "+"Long engineering project name with full client scope ".repeat(18)+"TITLE-END-SENTINEL";
    input.identity.project_introduction="INTRO-START "+"A complete engineering design description must remain visible in this controlled report. ".repeat(190)+" INTRO-END";
    input.identity.key_objectives=["OBJECTIVE-START "+"Confirm technical interfaces and controlled engineering assurance. ".repeat(95)+" OBJECTIVE-END"];
    const disciplineName=(index:number)=>`Discipline ${index+1} - Mechanical, electrical and instrumentation interface assurance`;
    input.disciplines=Array.from({length:40},(_,index)=>({...input.disciplines[0],discipline:disciplineName(index)}));
    input.s_curve.disciplines=input.disciplines.map(row=>({discipline:row.discipline,planned:row.planned,completed:row.completed,variance:-5,completion_percent:row.actual_completion}));
    input.weekly_issued_deliverables=Array.from({length:160},(_,index)=>({document_number:`ISSUED-${String(index+1).padStart(3,"0")}`,title:`Engineering deliverable ${index+1}: ${"Long design title and interdisciplinary interface ".repeat(index===0?60:3)}END-TITLE-${index+1}`,discipline:disciplineName(index%40),revision_code:"IFD-001",issue_status:"Issued for Design (IFD)",issued_at:"2026-10-12T14:00:00Z"}));
    input.lookahead=Array.from({length:155},(_,index)=>({document_number:`PLANNED-${String(index+1).padStart(3,"0")}`,title:`Planned deliverable ${index+1}: ${"Complete engineering document title ".repeat(3)}`,discipline:disciplineName(index%40),responsible_party:"Responsible engineering team, lead engineer and package interface coordinator",planned_submission_date:"2026-10-19",required_issue_status:"Issued for Design (IFD) with interdisciplinary coordination"}));
    input.challenges=[{...input.challenges[0],description:"CHALLENGE-START "+"Open engineering interfaces need coordinated action and recorded technical decisions. ".repeat(170)+" CHALLENGE-END"}];
    const before=JSON.stringify(input),bytes=await buildProjectReportPdfV2({snapshot:input,report});
    expect(JSON.stringify(input)).toBe(before);
    const value=fullText(drawn);
    for(const token of ["TITLE-END-SENTINEL","INTRO-START","INTRO-END","OBJECTIVE-START","OBJECTIVE-END","CHALLENGE-START","CHALLENGE-END","ISSUED-001","ISSUED-160","PLANNED-001","PLANNED-155","END-TITLE-160"])expect(value).toContain(token);
    for(let index=0;index<40;index++)expect(value).toContain(disciplineName(index));
    expect(drawn.filter(item=>item.text==="Discipline").length).toBeGreaterThan(4);
    const terminalHeading=drawn.find(item=>item.text==="Discipline scope and variance")!;
    expect(drawn.some(item=>item.page===terminalHeading.page&&item.text==="Planned scope")).toBe(true);
    checkBounds(drawn);
    const pdf=await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(20);
    await savePreview("report-layout-v2-stress-preview.pdf",bytes);
  },30000);

  it("shows missing weekly data explicitly without inventing chart values",async()=>{
    const drawn=capture(),input=snapshot();input.s_curve={overall:[],disciplines:[]};
    await buildProjectReportPdfV2({snapshot:input,report});
    expect(fullText(drawn)).toContain("Not enough saved weekly data is available to draw an S-curve. No curve or historical values have been inferred.");
    expect(fullText(drawn)).not.toContain("Latest saved weekly actual:");
    checkBounds(drawn);
  });

  it("sparsely labels a dense multi-year chart and uses distinct line styles",async()=>{
    const drawn=capture(),input=snapshot();
    input.s_curve.overall=Array.from({length:157},(_,index)=>({date:new Date(Date.UTC(2024,0,3+index*7)).toISOString().slice(0,10),planned:Math.min(100,index),completed:index<100?index*.47:null}));
    const lineSpy=vi.spyOn(PDFPage.prototype,"drawLine");
    await buildProjectReportPdfV2({snapshot:input,report});
    expect(drawn.filter(item=>/^\d{2} [A-Z][a-z]{2} \d{2}$/.test(item.text))).toHaveLength(5);
    expect(drawn.filter(item=>/^\d+(\.\d+)?%$/.test(item.text)).length).toBeLessThan(20);
    expect(lineSpy.mock.calls.some((call:Parameters<PDFPage["drawLine"]>)=>call[0].dashArray?.length)).toBe(true);
    expect(fullText(drawn)).toContain("Planned (dashed)");
    expect(fullText(drawn)).toContain("Weekly actual (solid)");
    checkBounds(drawn);
  });

  it("keeps EngiCite attribution only in the visible footer and table fonts at least nine points",async()=>{
    const drawn=capture();await buildProjectReportPdfV2({snapshot:snapshot(),report});
    const attribution=drawn.filter(item=>/engicite/i.test(item.text));
    expect(attribution.length).toBeGreaterThan(0);
    expect(attribution.every(item=>item.options.y===24)).toBe(true);
    for(const item of drawn.filter(item=>item.text==="Discipline"||item.text==="Process"||item.text==="Document number and title"))expect(item.options.size).toBeGreaterThanOrEqual(9);
  });

  it("represents unsupported Unicode code points explicitly instead of deleting identifiers",async()=>{
    const drawn=capture(),input=snapshot();
    input.identity.project_name="Layout preview - Ω中 project 🚢";
    input.weekly_issued_deliverables[0].document_number="DOC-中-001";
    await buildProjectReportPdfV2({snapshot:input,report});
    expect(fullText(drawn)).toContain("Layout preview - [U+03A9][U+4E2D] project [U+1F6A2]");
    expect(fullText(drawn)).toContain("DOC-[U+4E2D]-001");
    checkBounds(drawn);
  });

  it("embeds supplied client and contractor PNG branding without making it a dependency",async()=>{
    const png={mimeType:"image/png",bytes:new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/XioAAAAASUVORK5CYII=","base64"))};
    const drawImage=vi.spyOn(PDFPage.prototype,"drawImage");
    await buildProjectReportPdfV2({snapshot:snapshot(),report,organisationLogo:png,clientLogos:[png,png,png]});
    expect(drawImage).toHaveBeenCalledTimes(4);
    await expect(buildProjectReportPdfV2({snapshot:snapshot(),report,organisationLogo:{mimeType:"image/jpeg",bytes:new Uint8Array([0,1,2])}})).resolves.toBeInstanceOf(Uint8Array);
  });

  it("uses an independent neutral report palette and the reference-inspired document outline",async()=>{
    const drawn=capture(),rectangles=vi.spyOn(PDFPage.prototype,"drawRectangle"),rules=vi.spyOn(PDFPage.prototype,"drawLine");
    const input=snapshot();input.disciplines.push({...input.disciplines[0],discipline:"Electrical"});
    await buildProjectReportPdfV2({snapshot:input,report});
    for(const item of drawn.filter(item=>item.text==="Discipline"||item.text==="Document number and title"||item.text==="Planned date")){
      expect(item.options.color).toEqual(rgb(53/255,61/255,67/255));expect(item.options.size).toBe(9);
    }
    expect(rectangles.mock.calls.some((call:Parameters<PDFPage["drawRectangle"]>)=>JSON.stringify(call[0]?.color)===JSON.stringify(rgb(53/255,61/255,67/255))&&call[0]?.height===24)).toBe(true);
    expect(rectangles.mock.calls.some((call:Parameters<PDFPage["drawRectangle"]>)=>JSON.stringify(call[0]?.color)===JSON.stringify(rgb(241/255,243/255,243/255))&&call[0]?.borderWidth===.4)).toBe(true);
    expect(rules.mock.calls.some((call:Parameters<PDFPage["drawLine"]>)=>call[0].start.x===call[0].end.x&&call[0].thickness===.4&&JSON.stringify(call[0].color)===JSON.stringify(rgb(201/255,206/255,206/255)))).toBe(true);
    expect(rectangles.mock.calls.some((call:Parameters<PDFPage["drawRectangle"]>)=>call[0]?.width===3&&JSON.stringify(call[0]?.color)===JSON.stringify(rgb(66/255,106/255,103/255)))).toBe(true);
    const colours=[...drawn.map(item=>item.options.color),...rectangles.mock.calls.map((call:Parameters<PDFPage["drawRectangle"]>)=>call[0]?.color),...rules.mock.calls.map((call:Parameters<PDFPage["drawLine"]>)=>call[0].color)];
    for(const brandColour of [rgb(16/255,36/255,62/255),rgb(190/255,76/255,29/255)])expect(colours.some(colour=>JSON.stringify(colour)===JSON.stringify(brandColour))).toBe(false);
    for(const label of ["Report reference","Reporting period:","Snapshot captured:","Generation"])expect(drawn.some(item=>item.text===label)).toBe(true);
    expect(drawn.find(item=>item.text==="Project delivery S-curve")?.options.size).toBe(12.5);
    const plannedHeader=drawn.find(item=>item.text==="Planned completion")!;
    const plannedValue=drawn.find(item=>item.text==="74%")!;
    const rightEdge=(item:Drawn)=>item.options.x!+item.options.font!.widthOfTextAtSize(item.text,item.options.size!);
    expect(rightEdge(plannedValue)).toBeCloseTo(rightEdge(plannedHeader),4);
    // Executive figures are a single fine-lined register, not separate dashboard cards.
    expect(rectangles.mock.calls.some((call:Parameters<PDFPage["drawRectangle"]>)=>call[0]?.borderWidth===.7)).toBe(false);
    checkBounds(drawn);
  });

  it.each([39,41,43,45])("keeps the complete summary register together near a page break with title length %s",async(repetitions)=>{
    const drawn=capture(),input=snapshot();
    input.identity.project_name="LAYOUT PREVIEW - NOT ISSUED - "+"Long engineering title ".repeat(repetitions);
    await buildProjectReportPdfV2({snapshot:input,report});
    const figures=drawn.filter(item=>item.options.size===17&&["50%","+5%","Needs attention","100","40","2"].includes(item.text));
    expect(figures).toHaveLength(6);
    expect(new Set(figures.map(item=>item.page)).size).toBe(1);
    checkBounds(drawn);
  });
});
