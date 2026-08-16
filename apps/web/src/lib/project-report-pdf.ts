import {PDFDocument,StandardFonts,degrees,rgb,type PDFFont,type PDFImage,type PDFPage} from "pdf-lib";
import {assessProjectHealth} from "@/lib/project-health";
import {disciplineReportColumnLabel,disciplineReportValue,isProjectSCurveWeeklyDate,progressMovement,projectReportNumber,projectSCurveCurrentWeekDate,projectSCurveProgress,type ProjectReportSnapshot} from "@/lib/project-report";
import {projectDeliveryStageLabel} from "@/lib/project-delivery-stage";

type ReportMetadata={reportNumber:number;periodStart:string;periodEnd:string;generationSource:string;generatedAt:string};
type LogoAsset={bytes:Uint8Array;mimeType:string};
type BuildInput={snapshot:ProjectReportSnapshot;report:ReportMetadata;organisationLogo?:LogoAsset|null;clientLogos?:LogoAsset[]};

const PAGE_WIDTH=595.28;
const PAGE_HEIGHT=841.89;
const MARGIN=36;
const CONTENT_WIDTH=PAGE_WIDTH-MARGIN*2;
const NAVY=rgb(16/255,36/255,62/255);
const INK=rgb(20/255,38/255,61/255);
const MUTED=rgb(100/255,115/255,134/255);
const ORANGE=rgb(237/255,113/255,56/255);
const GREEN=rgb(13/255,104/255,79/255);
const LINE=rgb(221/255,228/255,235/255);
const PAPER=rgb(248/255,250/255,249/255);
const PALE_ORANGE=rgb(1,247/255,242/255);
const PALE_RED=rgb(1,249/255,247/255);

export function cleanPdfText(value:unknown){
  return String(value??"")
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201c\u201d]/g,'"')
    .replace(/[\u2012\u2013\u2014\u2212]/g,"-")
    .replace(/[\u00b7\u2022]/g," | ")
    .replace(/\u2026/g,"...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g,"");
}

export function projectReportPdfFilename(projectCode:string,reportNumber:number){
  const safe=cleanPdfText(projectCode).replace(/[^A-Za-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"")||"PROJECT";
  return `${safe}-${projectReportNumber(reportNumber)}.pdf`;
}

export async function buildProjectReportPdf({snapshot,report,organisationLogo,clientLogos=[]}:BuildInput){
  const pdf=await PDFDocument.create();
  pdf.setTitle(`${snapshot.identity.project_code} ${projectReportNumber(report.reportNumber)} - Weekly Project Progress Report`);
  pdf.setAuthor("EngiCite");
  pdf.setCreator("EngiCite Project Reporting");
  pdf.setProducer("EngiCite");
  pdf.setSubject("Controlled weekly project progress report");
  pdf.setCreationDate(new Date(report.generatedAt));
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const embeddedOrganisation=organisationLogo?await embedLogo(pdf,organisationLogo):null;
  const embeddedClients=(await Promise.all(clientLogos.slice(0,3).map(asset=>embedLogo(pdf,asset)))).filter((value):value is PDFImage=>Boolean(value));
  const context={pdf,regular,bold,snapshot,report,page:null as PDFPage|null,y:0,pageNumber:0};

  addCoverPage(context,embeddedOrganisation,embeddedClients);
  drawExecutiveSummary(context);
  drawProjectBrief(context);
  drawDisciplineProgress(context);
  drawWeeklyActivity(context);
  drawWeeklyIssuedDeliverables(context);
  drawLookAhead(context);
  drawChallenges(context);
  drawSCurve(context);
  addPageNumbers(context);
  return pdf.save();
}

type Context={pdf:PDFDocument;regular:PDFFont;bold:PDFFont;snapshot:ProjectReportSnapshot;report:ReportMetadata;page:PDFPage|null;y:number;pageNumber:number};

function addCoverPage(context:Context,organisationLogo:PDFImage|null,clientLogos:PDFImage[]){
  const page=context.pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);context.page=page;context.pageNumber=1;
  page.drawRectangle({x:0,y:PAGE_HEIGHT-190,width:PAGE_WIDTH,height:190,color:rgb(1,1,1)});
  page.drawRectangle({x:0,y:PAGE_HEIGHT-195,width:PAGE_WIDTH,height:5,color:ORANGE});
  const clientBoxWidth=64,logoGap=6,clientGroupWidth=Math.max(clientBoxWidth,clientLogos.length*clientBoxWidth+Math.max(0,clientLogos.length-1)*logoGap);
  let clientX=MARGIN;
  if(clientLogos.length)for(const logo of clientLogos)clientX=drawLogoBox(page,logo,clientX,PAGE_HEIGHT-84,clientBoxWidth,46)+logoGap;
  else drawLogoBox(page,null,clientX,PAGE_HEIGHT-84,clientBoxWidth,46);
  const contractorWidth=88,contractorX=PAGE_WIDTH-MARGIN-contractorWidth;
  drawLogoBox(page,organisationLogo,contractorX,PAGE_HEIGHT-84,contractorWidth,46);
  page.drawText("CLIENT",{x:MARGIN,y:PAGE_HEIGHT-20,size:6.5,font:context.bold,color:MUTED});
  drawRight(page,"CONTRACTOR",PAGE_WIDTH-MARGIN,PAGE_HEIGHT-20,6.5,context.bold,MUTED);
  const titleLeft=MARGIN+clientGroupWidth+14,titleRight=contractorX-14,titleWidth=Math.max(140,titleRight-titleLeft),titleCenter=titleLeft+titleWidth/2;
  drawCenteredWrapped(page,context.snapshot.identity.project_code,titleCenter,PAGE_HEIGHT-35,titleWidth,8,10,context.bold,NAVY,1);
  drawCenteredWrapped(page,context.snapshot.identity.project_name,titleCenter,PAGE_HEIGHT-58,titleWidth,17,19,context.bold,NAVY,2);
  const identity=`${context.snapshot.identity.organisation_name} | Client: ${context.snapshot.identity.client_name??"Not specified"}${context.snapshot.identity.facility_location?` | ${context.snapshot.identity.facility_location}`:""} | ${projectDeliveryStageLabel(context.snapshot.identity.delivery_stage)} | 100% at ${context.snapshot.identity.terminal_issue_status}`;
  drawCenteredWrapped(page,identity,PAGE_WIDTH/2,PAGE_HEIGHT-103,CONTENT_WIDTH,8.5,11,context.regular,NAVY,2);
  page.drawLine({start:{x:MARGIN,y:PAGE_HEIGHT-125},end:{x:PAGE_WIDTH-MARGIN,y:PAGE_HEIGHT-125},thickness:.8,color:LINE});
  page.drawText("WEEKLY PROJECT PROGRESS REPORT",{x:MARGIN,y:PAGE_HEIGHT-148,size:7.5,font:context.bold,color:NAVY});
  page.drawText(projectReportNumber(context.report.reportNumber),{x:MARGIN,y:PAGE_HEIGHT-171,size:17,font:context.bold,color:NAVY});
  page.drawText(context.report.generationSource==="scheduled"?"AUTOMATICALLY GENERATED":"GENERATED ON DEMAND",{x:MARGIN,y:PAGE_HEIGHT-185,size:6.5,font:context.bold,color:MUTED});
  page.drawRectangle({x:PAGE_WIDTH-210,y:PAGE_HEIGHT-181,width:174,height:48,color:PAPER,borderColor:LINE,borderWidth:.8});
  page.drawText("REPORTING PERIOD",{x:PAGE_WIDTH-198,y:PAGE_HEIGHT-149,size:7,font:context.bold,color:NAVY});
  page.drawText(`${formatDate(context.report.periodStart)} - ${formatDate(context.report.periodEnd)}`,{x:PAGE_WIDTH-198,y:PAGE_HEIGHT-168,size:10,font:context.bold,color:NAVY});
  context.y=PAGE_HEIGHT-226;
}

function addStandardPage(context:Context){
  const page=context.pdf.addPage([PAGE_WIDTH,PAGE_HEIGHT]);context.page=page;context.pageNumber+=1;
  page.drawRectangle({x:0,y:PAGE_HEIGHT-54,width:PAGE_WIDTH,height:54,color:rgb(1,1,1)});
  page.drawRectangle({x:0,y:PAGE_HEIGHT-58,width:PAGE_WIDTH,height:4,color:ORANGE});
  page.drawText(cleanPdfText(context.snapshot.identity.project_code),{x:MARGIN,y:PAGE_HEIGHT-33,size:8,font:context.bold,color:NAVY});
  page.drawText(cleanPdfText(context.snapshot.identity.project_name).slice(0,68),{x:MARGIN+75,y:PAGE_HEIGHT-33,size:9,font:context.bold,color:NAVY});
  drawRight(page,projectReportNumber(context.report.reportNumber),PAGE_WIDTH-MARGIN,PAGE_HEIGHT-33,9,context.bold,NAVY);
  context.y=PAGE_HEIGHT-82;
}

function ensure(context:Context,height:number){if(!context.page||context.y-height<48)addStandardPage(context)}

function section(context:Context,eyebrow:string,title:string){
  ensure(context,38);const page=context.page!;
  page.drawText(cleanPdfText(eyebrow).toUpperCase(),{x:MARGIN,y:context.y,size:7.5,font:context.bold,color:ORANGE});
  context.y-=16;page.drawText(cleanPdfText(title),{x:MARGIN,y:context.y,size:15,font:context.bold,color:INK});context.y-=22;
}

function drawExecutiveSummary(context:Context){
  section(context,"Progress Overview","Project health and delivery completion");
  const summary=context.snapshot.summary;
  const critical=context.snapshot.challenges.filter(issue=>issue.severity==="critical").length;
  const high=context.snapshot.challenges.filter(issue=>issue.severity==="high").length;
  const health=assessProjectHealth({deliverables:summary.total_deliverables,completion:summary.overall_progress,overdue:summary.overdue_deliverables,highIssues:high,criticalIssues:critical});
  const metrics=[
    ["Project health",health,"normal"],["Stage-weighted completion",`${summary.overall_progress}%`,"accent"],["Movement this week",progressMovement(summary.progress_gain),"normal"],
    ["Planned deliverables",String(summary.planned_deliverables),"normal"],["Terminal-stage issued",String(summary.completed_deliverables),"normal"],["Overdue",String(summary.overdue_deliverables),summary.overdue_deliverables?"warn":"normal"],
  ] as const;
  const gap=8;const width=(CONTENT_WIDTH-gap*2)/3;const height=49;
  metrics.forEach(([label,value,tone],index)=>{
    const row=Math.floor(index/3),column=index%3,x=MARGIN+column*(width+gap),y=context.y-row*(height+8)-height;
    const fill=tone==="accent"?PALE_ORANGE:tone==="warn"?PALE_RED:rgb(1,1,1);const border=tone==="accent"?ORANGE:tone==="warn"?rgb(239/255,198/255,180/255):LINE;
    context.page!.drawRectangle({x,y,width,height,color:fill,borderColor:border,borderWidth:1});
    context.page!.drawText(cleanPdfText(value),{x:x+10,y:y+24,size:16,font:context.bold,color:tone==="accent"?ORANGE:tone==="warn"?rgb(165/255,69/255,47/255):INK});
    context.page!.drawText(label.toUpperCase(),{x:x+10,y:y+10,size:6.3,font:context.bold,color:MUTED});
  });
  context.y-=height*2+25;
}

function drawProjectBrief(context:Context){
  const introduction=context.snapshot.identity.project_introduction??"No project introduction was recorded when this report was generated.";
  const introductionLines=wrapText(introduction,context.regular,8.5,CONTENT_WIDTH-24);
  const introductionHeight=Math.max(48,introductionLines.length*11+30);
  ensure(context,38+introductionHeight);
  section(context,"Project context","Project Brief");
  context.page!.drawRectangle({x:MARGIN,y:context.y-introductionHeight,width:CONTENT_WIDTH,height:introductionHeight,color:PAPER,borderColor:LINE,borderWidth:.8});
  context.page!.drawText("PROJECT INTRODUCTION",{x:MARGIN+12,y:context.y-15,size:6.5,font:context.bold,color:MUTED});
  drawLines(context.page!,introductionLines,MARGIN+12,context.y-31,11,8.5,context.regular,INK);
  context.y-=introductionHeight+12;
  context.page!.drawText("KEY OBJECTIVES",{x:MARGIN,y:context.y,size:6.5,font:context.bold,color:MUTED});
  context.y-=14;
  const objectives=context.snapshot.identity.key_objectives;
  if(!objectives.length){
    const lines=wrapText("No key objectives were recorded when this report was generated.",context.regular,8.5,CONTENT_WIDTH-18);
    const height=lines.length*11+12;ensure(context,height);drawLines(context.page!,lines,MARGIN+12,context.y-10,11,8.5,context.regular,MUTED);context.y-=height+12;return;
  }
  for(const objective of objectives){
    const lines=wrapText(objective,context.regular,8.5,CONTENT_WIDTH-28);const height=Math.max(18,lines.length*11+5);ensure(context,height);
    context.page!.drawCircle({x:MARGIN+5,y:context.y-7,size:2,color:ORANGE});
    drawLines(context.page!,lines,MARGIN+16,context.y-10,11,8.5,context.regular,INK);context.y-=height;
  }
  context.y-=14;
}

function drawDisciplineProgress(context:Context){
  section(context,"Discipline performance","Lifetime scope, weekly delivery and cumulative position");
  if(!context.snapshot.disciplines.length){emptyState(context,"No active MDR deliverables were available for this report.");return}
  const columnGroups:(typeof context.snapshot.discipline_columns)[]=[];for(let index=0;index<context.snapshot.discipline_columns.length;index+=8)columnGroups.push(context.snapshot.discipline_columns.slice(index,index+8));
  for(const [groupIndex,group] of columnGroups.entries()){
    if(groupIndex>0){ensure(context,30);context.page!.drawText("DISCIPLINE PERFORMANCE - CONTINUED",{x:MARGIN,y:context.y,size:7,font:context.bold,color:ORANGE});context.y-=15}
    const disciplineWidth=76;const metricWidth=(CONTENT_WIDTH-disciplineWidth)/group.length;
    const columns=[{label:"Discipline",width:disciplineWidth},...group.map(column=>({label:disciplineReportColumnLabel(column),width:metricWidth}))];
    drawPerformanceTableHeader(context,columns);
    for(const row of context.snapshot.disciplines){
      const pageBefore=context.pageNumber;ensure(context,34);if(context.pageNumber!==pageBefore)drawPerformanceTableHeader(context,columns);
      const values=[row.discipline,...group.map(column=>disciplineReportValue(row,column))];
      drawTableRow(context,columns,values,34,-1);
    }
    context.y-=groupIndex<columnGroups.length-1?16:8;
  }
  const note=`Actual completion is stage-weighted from the latest DCC-accepted issue. Terminal variance compares deliverables at ${context.snapshot.identity.terminal_issue_status} with final milestones due at the cut-off.`;
  const noteLines=wrapText(note,context.regular,6.8,CONTENT_WIDTH);ensure(context,noteLines.length*9+10);drawLines(context.page!,noteLines,MARGIN,context.y-7,9,6.8,context.regular,MUTED);context.y-=noteLines.length*9+20;
}

function drawWeeklyActivity(context:Context){
  section(context,"Past week","Delivery activity");
  ensure(context,93);const summary=context.snapshot.summary;const cards=[
    ["STAGE ISSUES THIS WEEK",summary.weekly_acceptances],["TERMINAL-STAGE ISSUED",summary.completed_deliverables],["FINAL MILESTONES DUE",summary.weekly_due],
  ] as const;const gap=9,width=(CONTENT_WIDTH-gap*2)/3;
  cards.forEach(([label,value],index)=>{const x=MARGIN+index*(width+gap);context.page!.drawRectangle({x,y:context.y-48,width,height:48,color:PAPER,borderColor:LINE,borderWidth:1});context.page!.drawText(String(value),{x:x+12,y:context.y-23,size:16,font:context.bold,color:ORANGE});context.page!.drawText(label,{x:x+12,y:context.y-38,size:6.5,font:context.bold,color:MUTED})});
  context.y-=61;
  const movement=context.snapshot.summary.progress_gain;
  const narrative=movement===null?"This report establishes the first controlled baseline.":movement>=0?"The project maintained or improved its controlled delivery position.":"The percentage reduced because MDR scope, accepted revision stages or the delivery plan changed.";
  const lines=wrapText(`Stage-weighted completion movement is ${progressMovement(movement)}. ${narrative}`,context.regular,9,CONTENT_WIDTH-22);
  const height=lines.length*12+18;ensure(context,height);context.page!.drawRectangle({x:MARGIN,y:context.y-height,width:CONTENT_WIDTH,height,color:PAPER});
  drawLines(context.page!,lines,MARGIN+11,context.y-15,12,9,context.regular,MUTED);context.y-=height+20;
}

function drawWeeklyIssuedDeliverables(context:Context){
  section(context,"Reporting week submissions","Issued deliverables");
  if(!context.snapshot.weekly_issued_deliverables.length){emptyState(context,"No deliverable was issued during this reporting week.");return}
  const grouped=new Map<string,typeof context.snapshot.weekly_issued_deliverables>();
  for(const item of context.snapshot.weekly_issued_deliverables){const items=grouped.get(item.discipline)??[];items.push(item);grouped.set(item.discipline,items)}
  const groups=[...grouped.entries()].sort(([left],[right])=>left.localeCompare(right));
  const columns=[{label:"Issued date",width:80},{label:"Document",width:258},{label:"Revision",width:62},{label:"Issue status",width:123}];
  for(const [discipline,items] of groups){
    ensure(context,79);drawLookAheadDisciplineHeader(context,discipline,items.length);drawTableHeader(context,columns);
    for(const item of items){
      const title=`${item.document_number} - ${item.title}`;const titleLines=wrapText(title,context.regular,7.5,columns[1].width-12);const height=Math.max(32,titleLines.length*10+12);const pageBefore=context.pageNumber;ensure(context,height);
      if(context.pageNumber!==pageBefore){drawLookAheadDisciplineHeader(context,discipline,items.length);drawTableHeader(context,columns)}
      drawTableRow(context,columns,[formatTimestampDate(item.issued_at),title,item.revision_code,item.issue_status],height,-1);
    }
    context.y-=12;
  }
  context.y-=18;
}

function drawLookAhead(context:Context){
  section(context,"Next week look-ahead","Planned deliverable submissions");
  if(!context.snapshot.lookahead.length){emptyState(context,"No MDR submission is planned in the next seven days.");return}
  const grouped=new Map<string,typeof context.snapshot.lookahead>();
  for(const item of context.snapshot.lookahead){const items=grouped.get(item.discipline)??[];items.push(item);grouped.set(item.discipline,items)}
  const groups=[...grouped.entries()].sort(([left],[right])=>left.localeCompare(right));
  const columns=[{label:"Planned date",width:80},{label:"Document",width:260},{label:"Responsible",width:100},{label:"Required issue",width:83}];
  for(const [discipline,items] of groups){
    const firstTitle=`${items[0].document_number} - ${items[0].title}`;const firstLines=wrapText(firstTitle,context.regular,7.5,columns[1].width-12);const firstHeight=Math.max(32,firstLines.length*10+12);
    ensure(context,47+firstHeight);drawLookAheadDisciplineHeader(context,discipline,items.length);drawTableHeader(context,columns);
    for(const item of items){
      const title=`${item.document_number} - ${item.title}`;const titleLines=wrapText(title,context.regular,7.5,columns[1].width-12);const height=Math.max(32,titleLines.length*10+12);const pageBefore=context.pageNumber;ensure(context,height);
      if(context.pageNumber!==pageBefore){drawLookAheadDisciplineHeader(context,discipline,items.length);drawTableHeader(context,columns)}
      drawTableRow(context,columns,[formatDate(item.planned_submission_date),title,item.responsible_party??"Unassigned",item.required_issue_status??"Not specified"],height,-1);
    }
    context.y-=12;
  }
  context.y-=18;
}

function drawLookAheadDisciplineHeader(context:Context,discipline:string,count:number){
  ensure(context,26);context.page!.drawRectangle({x:MARGIN,y:context.y-24,width:CONTENT_WIDTH,height:24,color:PAPER,borderColor:LINE,borderWidth:.8});
  context.page!.drawText(cleanPdfText(discipline.toUpperCase()),{x:MARGIN+9,y:context.y-16,size:7.5,font:context.bold,color:NAVY});
  drawRight(context.page!,`${count} ${count===1?"DELIVERABLE":"DELIVERABLES"}`,PAGE_WIDTH-MARGIN-9,context.y-16,6.5,context.bold,MUTED);context.y-=24;
}

function drawChallenges(context:Context){
  section(context,"Challenges and actions","Open project issues requiring attention");
  if(!context.snapshot.challenges.length){emptyState(context,"No open project challenge was recorded at generation time.",true);return}
  for(const challenge of context.snapshot.challenges){
    const body=[challenge.title,challenge.description??"",`Owner: ${challenge.owner_name??"Unassigned"} | Target: ${formatDate(challenge.due_date)}`].filter(Boolean);
    const bodyLines=body.flatMap((line,index)=>wrapText(line,index===0?context.bold:context.regular,index===0?10:8.5,CONTENT_WIDTH-24));
    const height=bodyLines.length*12+34;ensure(context,height);
    context.page!.drawRectangle({x:MARGIN,y:context.y-height,width:CONTENT_WIDTH,height,color:rgb(1,1,1),borderColor:LINE,borderWidth:1});
    context.page!.drawRectangle({x:MARGIN+12,y:context.y-20,width:58,height:14,color:challenge.severity==="critical"?rgb(253/255,232/255,228/255):challenge.severity==="high"?PALE_ORANGE:rgb(1,247/255,221/255)});
    context.page!.drawText(challenge.severity.toUpperCase(),{x:MARGIN+18,y:context.y-16,size:6.5,font:context.bold,color:challenge.severity==="critical"?rgb(155/255,44/255,36/255):rgb(165/255,69/255,47/255)});
    drawLines(context.page!,bodyLines,MARGIN+12,context.y-36,12,8.5,context.regular,INK);context.y-=height+9;
  }
}

function drawSCurve(context:Context){
  addStandardPage(context);
  section(context,"Schedule performance","Project delivery S-curve");
  const curve=context.snapshot.s_curve;
  const description=`The planned curve uses final-issue dates. Actual progress is stage-weighted from DCC-accepted revisions and reaches 100% only at ${context.snapshot.identity.terminal_issue_status}.`;
  const descriptionLines=wrapText(description,context.regular,8.5,CONTENT_WIDTH);
  drawLines(context.page!,descriptionLines,MARGIN,context.y,11,8.5,context.regular,MUTED);context.y-=descriptionLines.length*11+18;
  if(curve.overall.length<2){emptyState(context,"The S-curve will appear after MDR submission dates and issued deliverables are available.");return}

  const progress=projectSCurveProgress(curve,context.snapshot.summary.planned_deliverables);
  const chartX=MARGIN+38,chartTop=context.y,chartWidth=CONTENT_WIDTH-50,chartHeight=174,chartBottom=chartTop-chartHeight;
  const firstDate=new Date(`${progress[0].date}T00:00:00Z`).getTime(),lastDate=new Date(`${progress[progress.length-1].date}T00:00:00Z`).getTime();
  const pointX=(value:string)=>chartX+Math.min(1,Math.max(0,(new Date(`${value}T00:00:00Z`).getTime()-firstDate)/Math.max(1,lastDate-firstDate)))*chartWidth;
  const pointY=(value:number)=>chartBottom+(value/100)*chartHeight;
  context.page!.drawRectangle({x:chartX,y:chartBottom,width:chartWidth,height:chartHeight,color:PAPER});
  for(const value of [0,25,50,75,100]){
    const y=pointY(value);
    context.page!.drawLine({start:{x:chartX,y},end:{x:chartX+chartWidth,y},thickness:.5,color:LINE});
    drawRight(context.page!,`${value}%`,chartX-7,y-2,6.5,context.regular,MUTED);
  }
  for(let index=1;index<progress.length;index+=1){
    const previous=progress[index-1],current=progress[index];
    context.page!.drawLine({start:{x:pointX(previous.date),y:pointY(previous.planned)},end:{x:pointX(current.date),y:pointY(current.planned)},thickness:2.2,color:ORANGE});
    if(previous.actual!==null&&current.actual!==null)context.page!.drawLine({start:{x:pointX(previous.date),y:pointY(previous.actual)},end:{x:pointX(current.date),y:pointY(current.actual)},thickness:2.2,color:GREEN});
  }
  progress.forEach(point=>{
    const plannedLabel=formatProgressPercentage(point.planned),plannedX=pointX(point.date)-context.bold.widthOfTextAtSize(plannedLabel,5.5)/2;
    context.page!.drawCircle({x:pointX(point.date),y:pointY(point.planned),size:2,color:ORANGE});
    context.page!.drawText(plannedLabel,{x:plannedX,y:pointY(point.planned)+5,size:5.5,font:context.bold,color:ORANGE});
    if(point.actual!==null){const actualLabel=formatProgressPercentage(point.actual),actualX=pointX(point.date)-context.bold.widthOfTextAtSize(actualLabel,5.5)/2;context.page!.drawCircle({x:pointX(point.date),y:pointY(point.actual),size:2,color:GREEN});context.page!.drawText(actualLabel,{x:actualX,y:pointY(point.actual)-10,size:5.5,font:context.bold,color:GREEN})}
  });
  const currentWeekDate=projectSCurveCurrentWeekDate(progress.map(point=>point.date),context.report.periodEnd),currentWeekX=pointX(currentWeekDate);
  context.page!.drawLine({start:{x:currentWeekX,y:chartBottom},end:{x:currentWeekX,y:chartTop},thickness:.55,color:MUTED,dashArray:[2,3],opacity:.3});
  progress.forEach(point=>{if(!isProjectSCurveWeeklyDate(point.date,progress[0].date))return;
    const text=formatDate(point.date);context.page!.drawText(text,{x:pointX(point.date)+2,y:chartBottom-52,size:5.8,font:context.regular,color:MUTED,rotate:degrees(90)});
  });
  const legendY=chartBottom-72;
  context.page!.drawLine({start:{x:chartX,y:legendY},end:{x:chartX+24,y:legendY},thickness:2.4,color:ORANGE});
  context.page!.drawText("Planned progress",{x:chartX+30,y:legendY-3,size:7,font:context.bold,color:MUTED});
  context.page!.drawLine({start:{x:chartX+160,y:legendY},end:{x:chartX+184,y:legendY},thickness:2.4,color:GREEN});
  context.page!.drawText("Stage-weighted actual",{x:chartX+190,y:legendY-3,size:7,font:context.bold,color:MUTED});
  context.y=legendY-25;

  if(curve.disciplines.length){
    const columns=[{label:"Discipline",width:153},{label:"Planned scope",width:90},{label:"Terminal issued",width:110},{label:"Variance",width:70},{label:"Actual %",width:100}];
    drawTableHeader(context,columns);
    for(const row of curve.disciplines)drawTableRow(context,columns,[row.discipline,String(row.planned),String(row.completed),row.variance>0?`+${row.variance}`:String(row.variance),`${row.completion_percent}%`],28,row.variance<0?3:-1);
  }
}

function emptyState(context:Context,message:string,positive=false){
  const lines=wrapText(message,context.bold,9,CONTENT_WIDTH-24);const height=lines.length*12+24;ensure(context,height);
  context.page!.drawRectangle({x:MARGIN,y:context.y-height,width:CONTENT_WIDTH,height,color:positive?rgb(232/255,241/255,237/255):PAPER,borderColor:positive?GREEN:LINE,borderWidth:1});
  drawLines(context.page!,lines,MARGIN+12,context.y-19,12,9,context.bold,positive?GREEN:MUTED);context.y-=height+20;
}

type Column={label:string;width:number};
function drawPerformanceTableHeader(context:Context,columns:Column[]){
  ensure(context,35);let x=MARGIN;context.page!.drawRectangle({x:MARGIN,y:context.y-33,width:CONTENT_WIDTH,height:33,color:PAPER});
  columns.forEach(column=>{const lines=wrapText(column.label.toUpperCase(),context.bold,5.25,column.width-8).slice(0,3);drawLines(context.page!,lines,x+4,context.y-11,7,5.25,context.bold,MUTED);x+=column.width});context.y-=33;
}

function drawTableHeader(context:Context,columns:Column[]){
  ensure(context,25);let x=MARGIN;context.page!.drawRectangle({x:MARGIN,y:context.y-23,width:CONTENT_WIDTH,height:23,color:PAPER});
  columns.forEach(column=>{context.page!.drawText(column.label.toUpperCase(),{x:x+6,y:context.y-15,size:6.2,font:context.bold,color:MUTED});x+=column.width});context.y-=23;
}

function drawTableRow(context:Context,columns:Column[],values:string[],height:number,warnColumn:number){
  const y=context.y-height;context.page!.drawRectangle({x:MARGIN,y,width:CONTENT_WIDTH,height,color:rgb(1,1,1),borderColor:LINE,borderWidth:.5});let x=MARGIN;
  columns.forEach((column,index)=>{const lines=wrapText(values[index]??"",context.regular,index===0?8:7.5,column.width-12).slice(0,Math.max(1,Math.floor((height-10)/10)));drawLines(context.page!,lines,x+6,context.y-13,10,index===0?8:7.5,index===0?context.bold:context.regular,index===warnColumn&&Number(values[index])>0?rgb(165/255,69/255,47/255):INK);x+=column.width});context.y-=height;
}

function addPageNumbers(context:Context){
  const pages=context.pdf.getPages();pages.forEach((page,index)=>{
    page.drawLine({start:{x:MARGIN,y:29},end:{x:PAGE_WIDTH-MARGIN,y:29},thickness:.5,color:LINE});
    page.drawText(`ENGICITE CONTROLLED PROJECT REPORT | ${projectReportNumber(context.report.reportNumber)}`,{x:MARGIN,y:16,size:6.3,font:context.bold,color:MUTED});
    drawRight(page,`PAGE ${index+1} OF ${pages.length}`,PAGE_WIDTH-MARGIN,16,6.3,context.bold,MUTED);
  });
}

function drawLogoBox(page:PDFPage,image:PDFImage|null,x:number,y:number,width:number,height:number){
  page.drawRectangle({x,y,width,height,color:rgb(1,1,1),borderColor:LINE,borderWidth:.8});if(image){const scale=Math.min((width-12)/image.width,(height-10)/image.height);page.drawImage(image,{x:x+(width-image.width*scale)/2,y:y+(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale})}return x+width;
}

async function embedLogo(pdf:PDFDocument,asset:LogoAsset){
  try{if(asset.mimeType.includes("png"))return await pdf.embedPng(asset.bytes);if(asset.mimeType.includes("jpeg")||asset.mimeType.includes("jpg"))return await pdf.embedJpg(asset.bytes);return null}catch{return null}
}

function drawRight(page:PDFPage,text:string,right:number,y:number,size:number,font:PDFFont,color:ReturnType<typeof rgb>){const value=cleanPdfText(text);page.drawText(value,{x:right-font.widthOfTextAtSize(value,size),y,size,font,color})}
function drawCenteredWrapped(page:PDFPage,text:string,centerX:number,y:number,width:number,size:number,lineHeight:number,font:PDFFont,color:ReturnType<typeof rgb>,maxLines=99){const lines=wrapText(text,font,size,width).slice(0,maxLines);lines.forEach((line,index)=>page.drawText(cleanPdfText(line),{x:centerX-font.widthOfTextAtSize(line,size)/2,y:y-index*lineHeight,size,font,color}));return lines.length}
function drawLines(page:PDFPage,lines:string[],x:number,y:number,lineHeight:number,size:number,font:PDFFont,color:ReturnType<typeof rgb>){lines.forEach((line,index)=>page.drawText(cleanPdfText(line),{x,y:y-index*lineHeight,size,font,color}))}
function wrapText(value:string,font:PDFFont,size:number,maxWidth:number){
  const paragraphs=cleanPdfText(value).split(/\r?\n/);const lines:string[]=[];
  for(const paragraph of paragraphs){const words=paragraph.trim().split(/\s+/).filter(Boolean);if(!words.length){lines.push("");continue}let line="";for(const word of words){const candidate=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue}if(line)lines.push(line);if(font.widthOfTextAtSize(word,size)<=maxWidth){line=word;continue}let chunk="";for(const character of word){const next=chunk+character;if(font.widthOfTextAtSize(next,size)>maxWidth){if(chunk)lines.push(chunk);chunk=character}else chunk=next}line=chunk}if(line)lines.push(line)}return lines;
}
function formatDate(value:string|null){if(!value)return "Not planned";const date=new Date(`${value}T00:00:00Z`);return date.toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"})}
function formatTimestampDate(value:string){return new Date(value).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"})}
function formatProgressPercentage(value:number){return `${Number.isInteger(value)?value:value.toFixed(1)}%`}
