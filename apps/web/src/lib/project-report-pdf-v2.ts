import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFImage,type PDFPage} from "pdf-lib";
import {assessProjectHealth} from "@/lib/project-health";
import {disciplineReportColumnLabel,disciplineReportValue,progressMovement,projectReportNumber,projectSCurveProgress,type ProjectReportSnapshot} from "@/lib/project-report";
import {projectDeliveryStageLabel} from "@/lib/project-delivery-stage";
import {pdfColorTemplate} from "@/lib/pdf-color-template";

type ReportMetadata={reportNumber:number;periodStart:string;periodEnd:string;generationSource:string;generatedAt:string};
type LogoAsset={bytes:Uint8Array;mimeType:string};
type BuildInput={snapshot:ProjectReportSnapshot;report:ReportMetadata;organisationLogo?:LogoAsset|null;clientLogos?:LogoAsset[]};
type Colour=ReturnType<typeof rgb>;
type Column={label:string;width:number;align?:"right"};
type Cell=string|{text:string;warning?:boolean};
const W=595.28,H=841.89,M=40,CW=W-M*2,BOTTOM=55;
function colours(value:unknown){
  const palette=pdfColorTemplate(value).palette;
  const convert=(colour:readonly [number,number,number])=>rgb(colour[0]/255,colour[1]/255,colour[2]/255);
  return {GRAPHITE:convert(palette.header),INK:convert(palette.ink),MUTED:convert(palette.muted),TEAL:convert(palette.accent),PLANNED:convert(palette.planned),LINE:convert(palette.line),PAPER:convert(palette.paper),WHITE:convert(palette.white)};
}

// Kept independent from the legacy renderer: importing its wrapper here would create a cycle.
function text(value:unknown){
  const normalized=String(value??"").replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/[\u2012\u2013\u2014\u2212]/g,"-").replace(/[\u00b7\u2022]/g," | ").replace(/\u2026/g,"...");
  return Array.from(normalized,character=>{
    const point=character.codePointAt(0)!;
    return point===9||point===10||point===13||(point>=32&&point<=126)||(point>=160&&point<=255)?character:`[U+${point.toString(16).toUpperCase().padStart(4,"0")}]`;
  }).join("");
}
function date(value:string|null){if(!value)return "Not planned";return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"});}
function timestamp(value:string){return new Date(value).toLocaleString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})+" UTC";}
function shortDate(value:string,includeYear=false){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",...(includeYear?{year:"2-digit" as const}:{})});}
function percentage(value:number){return `${Number.isInteger(value)?value:value.toFixed(1)}%`;}

function wrap(value:string,font:PDFFont,size:number,width:number){
  const lines:string[]=[];
  for(const paragraph of text(value).split(/\r?\n/)){
    const words=paragraph.trim().split(/\s+/).filter(Boolean);
    if(!words.length){lines.push("");continue;}
    let line="";
    for(const word of words){
      const candidate=line?`${line} ${word}`:word;
      if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue;}
      if(line)lines.push(line);
      if(font.widthOfTextAtSize(word,size)<=width){line=word;continue;}
      let chunk="";
      for(const character of word){
        if(font.widthOfTextAtSize(chunk+character,size)>width){if(chunk)lines.push(chunk);chunk=character;}else chunk+=character;
      }
      line=chunk;
    }
    if(line)lines.push(line);
  }
  return lines;
}

class ReportCanvas{
  readonly colours:ReturnType<typeof colours>;
  page!:PDFPage;
  y=0;
  constructor(readonly pdf:PDFDocument,readonly regular:PDFFont,readonly bold:PDFFont,readonly input:BuildInput){this.colours=colours(input.snapshot.pdf_color_template);}
  continuationTop(){return H-M-Math.max(1,wrap(this.input.snapshot.identity.project_code,this.bold,9,CW-125).length)*12-33;}
  pageStart(first=false){
    this.page=this.pdf.addPage([W,H]);
    if(first){this.y=H-M;return;}
    const codeLines=wrap(this.input.snapshot.identity.project_code,this.bold,9,CW-125);
    const headerHeight=Math.max(1,codeLines.length)*12;
    this.at(projectReportNumber(this.input.report.reportNumber),W-M,H-M,9,this.bold,this.colours.MUTED,"right");
    codeLines.forEach((line,index)=>this.at(line,M,H-M-index*12,9,this.bold,this.colours.GRAPHITE));
    const ruleY=H-M-headerHeight-9;
    this.page.drawLine({start:{x:M,y:ruleY},end:{x:W-M,y:ruleY},thickness:.7,color:this.colours.LINE});
    this.y=ruleY-24;
  }
  ensure(height:number){if(this.y-height<BOTTOM)this.pageStart();}
  at(value:string,x:number,y:number,size=9,font=this.regular,color:Colour=this.colours.INK,align:"left"|"right"="left"){
    const clean=text(value);this.page.drawText(clean,{x:align==="right"?x-font.widthOfTextAtSize(clean,size):x,y,size,font,color});
  }
  paragraph(value:string,{size=9.5,leading=14,font=this.regular,color=this.colours.INK,indent=0,after=9}:{size?:number;leading?:number;font?:PDFFont;color?:Colour;indent?:number;after?:number}={}){
    for(const line of wrap(value,font,size,CW-indent)){
      this.ensure(leading);this.at(line,M+indent,this.y-size,size,font,color);this.y-=leading;
    }
    this.y-=after;
  }
  boxedParagraph(value:string){
    const lines=wrap(value,this.regular,9.5,CW-20),leading=14,padding=10;
    let offset=0;
    while(offset<lines.length){
      this.ensure(leading+padding*2);
      const available=Math.max(1,Math.floor((this.y-BOTTOM-padding*2)/leading));
      const count=Math.min(available,lines.length-offset),height=count*leading+padding*2;
      this.page.drawRectangle({x:M,y:this.y-height,width:CW,height,color:this.colours.PAPER,borderColor:this.colours.LINE,borderWidth:.4});
      lines.slice(offset,offset+count).forEach((line,index)=>this.at(line,M+padding,this.y-padding-9.5-index*leading,9.5,this.regular,this.colours.INK));
      this.y-=height;offset+=count;
      if(offset<lines.length)this.pageStart();
    }
    this.y-=10;
  }
  section(eyebrow:string,title:string){
    const titleLines=wrap(title,this.bold,12.5,CW-12);this.ensure(15+titleLines.length*16+28);
    this.at(eyebrow.toUpperCase(),M,this.y-8.5,8.5,this.bold,this.colours.MUTED);this.y-=16;
    this.page.drawRectangle({x:M,y:this.y-titleLines.length*16,width:3,height:titleLines.length*16,color:this.colours.TEAL});
    for(const line of titleLines){this.at(line,M+11,this.y-12.5,12.5,this.bold,this.colours.GRAPHITE);this.y-=16;}
    this.y-=11;
  }
  subheading(value:string){this.ensure(60);this.paragraph(value,{font:this.bold,size:10.5,leading:15,after:8});}
  tableStartHeight(columns:Column[],firstRow:Cell[]|undefined,caption?:string){
    const header=Math.max(...columns.map(column=>wrap(column.label,this.bold,9,column.width-16).length))*12+16;
    const captionHeight=caption?wrap(caption,this.bold,9,CW).length*12+8:0;
    const firstHeight=firstRow?Math.max(...columns.map((column,index)=>{
      const value=firstRow[index];return wrap(typeof value==="string"?value:value?.text??"",index===0?this.bold:this.regular,9,column.width-16).length;
    }))*12+16:28;
    const ordinaryRowLimit=Math.max(28,this.continuationTop()-header-captionHeight-BOTTOM-100);
    return header+captionHeight+Math.min(firstHeight,ordinaryRowLimit);
  }
  table(columns:Column[],rows:Cell[][],caption?:string){
    const size=9,leading=12,padding=8;
    const captionLines=caption?wrap(caption,this.bold,size,CW):[];
    const captionHeight=captionLines.length?captionLines.length*leading+8:0;
    const headingLines=columns.map(column=>wrap(column.label,this.bold,size,column.width-padding*2));
    const headingHeight=Math.max(...headingLines.map(lines=>lines.length))*leading+padding*2;
    const drawHeader=()=>{
      captionLines.forEach((line,index)=>this.at(line,M,this.y-size-index*leading,size,this.bold,this.colours.GRAPHITE));
      this.y-=captionHeight;
      this.page.drawRectangle({x:M,y:this.y-headingHeight,width:CW,height:headingHeight,color:this.colours.PAPER,borderColor:this.colours.LINE,borderWidth:.4});
      let x=M;
      headingLines.forEach((lines,index)=>{
        lines.forEach((line,lineIndex)=>this.at(line,columns[index].align==="right"?x+columns[index].width-padding:x+padding,this.y-padding-size-lineIndex*leading,size,this.bold,this.colours.GRAPHITE,columns[index].align==="right"?"right":"left"));
        x+=columns[index].width;
        if(index<columns.length-1)this.page.drawLine({start:{x,y:this.y},end:{x,y:this.y-headingHeight},thickness:.4,color:this.colours.LINE});
      });
      this.page.drawLine({start:{x:M,y:this.y-headingHeight+.45},end:{x:W-M,y:this.y-headingHeight+.45},thickness:.7,color:this.colours.LINE});
      this.y-=headingHeight;
    };
    this.ensure(this.tableStartHeight(columns,rows[0],caption));drawHeader();
    for(const [rowIndex,row] of rows.entries()){
      const values=row.map(value=>typeof value==="string"?{text:value}:value);
      const lines=columns.map((column,index)=>wrap(values[index]?.text??"",index===0?this.bold:this.regular,size,column.width-padding*2));
      const totalLines=Math.max(...lines.map(value=>value.length));
      const wholeHeight=totalLines*leading+padding*2;
      // Keep ordinary records together; exceptionally long narrative records may flow.
      const ordinaryRowLimit=Math.max(28,this.continuationTop()-headingHeight-captionHeight-BOTTOM-100);
      if(this.y-wholeHeight<BOTTOM&&wholeHeight<=ordinaryRowLimit){this.pageStart();drawHeader();}
      let offset=0;
      while(offset<totalLines){
        let available=Math.floor((this.y-BOTTOM-padding*2)/leading);
        if(available<1){this.pageStart();drawHeader();available=Math.floor((this.y-BOTTOM-padding*2)/leading);}
        const count=Math.min(available,totalLines-offset),height=count*leading+padding*2;
        this.page.drawRectangle({x:M,y:this.y-height,width:CW,height,color:rowIndex%2===0?this.colours.WHITE:this.colours.PAPER,borderColor:this.colours.LINE,borderWidth:.4});
        let x=M;
        columns.forEach((column,index)=>{
          const colour=values[index]?.warning?this.colours.GRAPHITE:this.colours.INK;
          lines[index].slice(offset,offset+count).forEach((line,lineIndex)=>this.at(line,column.align==="right"?x+column.width-padding:x+padding,this.y-padding-size-lineIndex*leading,size,index===0||values[index]?.warning?this.bold:this.regular,colour,column.align==="right"?"right":"left"));
          x+=column.width;
          if(index<columns.length-1)this.page.drawLine({start:{x,y:this.y},end:{x,y:this.y-height},thickness:.4,color:this.colours.LINE});
        });
        this.y-=height;offset+=count;
        if(offset<totalLines){this.pageStart();drawHeader();}
      }
    }
    this.y-=16;
  }
  footer(){
    const pages=this.pdf.getPages();
    pages.forEach((page,index)=>{
      page.drawLine({start:{x:M,y:39},end:{x:W-M,y:39},thickness:.6,color:this.colours.LINE});
      const footer=`Generated by EngiCite | ${projectReportNumber(this.input.report.reportNumber)}`;
      page.drawText(footer,{x:M,y:24,size:8,font:this.regular,color:this.colours.MUTED});
      const count=`Page ${index+1} of ${pages.length}`;
      page.drawText(count,{x:W-M-this.regular.widthOfTextAtSize(count,8),y:24,size:8,font:this.regular,color:this.colours.MUTED});
    });
  }
}

async function embedLogo(pdf:PDFDocument,asset:LogoAsset|undefined|null){
  if(!asset)return null;
  try{if(asset.mimeType.includes("png"))return await pdf.embedPng(asset.bytes);if(/jpe?g/.test(asset.mimeType))return await pdf.embedJpg(asset.bytes);}catch{/* Missing/corrupt optional branding must not prevent the controlled report. */}
  return null;
}

function logo(canvas:ReportCanvas,image:PDFImage|null,x:number,y:number,width:number,height:number){
  if(!image)return;
  const scale=Math.min(width/image.width,height/image.height);
  canvas.page.drawImage(image,{x:x+(width-image.width*scale)/2,y:y+(height-image.height*scale)/2,width:image.width*scale,height:image.height*scale});
}

async function cover(canvas:ReportCanvas){
  const {snapshot,report,organisationLogo,clientLogos=[]}=canvas.input;
  canvas.pageStart(true);
  const organisation=await embedLogo(canvas.pdf,organisationLogo);
  const clients=await Promise.all(clientLogos.slice(0,3).map(asset=>embedLogo(canvas.pdf,asset)));
  canvas.at("CLIENT",M,canvas.y-8,8,canvas.bold,canvas.colours.MUTED);
  canvas.at("CONTRACTOR",W-M,canvas.y-8,8,canvas.bold,canvas.colours.MUTED,"right");
  const clientFallback=clients.some(Boolean)?[]:wrap(snapshot.identity.client_name??"Not specified",canvas.regular,9,260);
  const organisationFallback=organisation?[]:wrap(snapshot.identity.organisation_name,canvas.regular,9,180);
  const brandingHeight=Math.max(clients.some(Boolean)||organisation?44:20,clientFallback.length*12,organisationFallback.length*12);
  clients.forEach((image,index)=>logo(canvas,image,M+index*70,canvas.y-20-brandingHeight,62,brandingHeight));
  logo(canvas,organisation,W-M-95,canvas.y-20-brandingHeight,95,brandingHeight);
  clientFallback.forEach((line,index)=>canvas.at(line,M,canvas.y-26-index*12,9,canvas.regular,canvas.colours.GRAPHITE));
  organisationFallback.forEach((line,index)=>canvas.at(line,W-M,canvas.y-26-index*12,9,canvas.regular,canvas.colours.GRAPHITE,"right"));
  canvas.y-=brandingHeight+39;
  canvas.page.drawLine({start:{x:M,y:canvas.y+12},end:{x:W-M,y:canvas.y+12},thickness:.6,color:canvas.colours.LINE});
  canvas.page.drawRectangle({x:M,y:canvas.y-24,width:CW,height:24,color:canvas.colours.GRAPHITE});
  canvas.at("WEEKLY PROJECT PROGRESS REPORT",M+9,canvas.y-16,10,canvas.bold,canvas.colours.WHITE);
  canvas.y-=34;
  canvas.paragraph(snapshot.identity.project_code,{size:10,font:canvas.bold,color:canvas.colours.MUTED,leading:14,after:4});
  canvas.paragraph(snapshot.identity.project_name,{size:17,font:canvas.bold,color:canvas.colours.GRAPHITE,leading:21,after:7});
  canvas.paragraph(`${snapshot.identity.organisation_name} | Client: ${snapshot.identity.client_name??"Not specified"}${snapshot.identity.facility_location?` | ${snapshot.identity.facility_location}`:""}`,{size:9.5,color:canvas.colours.MUTED,leading:13,after:6});
  canvas.paragraph(`${projectDeliveryStageLabel(snapshot.identity.delivery_stage)} | Terminal issue: ${snapshot.identity.terminal_issue_status}`,{size:9,font:canvas.bold,color:canvas.colours.GRAPHITE,leading:13,after:10});
  const metadata=[
    ["Report reference",projectReportNumber(report.reportNumber),"Reporting period:",`${date(report.periodStart)} - ${date(report.periodEnd)}`],
    ["Snapshot captured:",timestamp(report.generatedAt),"Generation",report.generationSource==="scheduled"?"Scheduled report":"Generated on demand"],
  ];
  const widths=[100,CW/2-100,100,CW/2-100],padding=7;
  const metadataRows=metadata.map(row=>{
    const lines=row.map((value,index)=>wrap(value,index%2===0?canvas.bold:canvas.regular,9,widths[index]-padding*2));
    return {lines,height:Math.max(...lines.map(value=>value.length))*12+padding*2};
  });
  canvas.ensure(metadataRows.reduce((height,row)=>height+row.height,0)+8);
  for(const {lines,height} of metadataRows){
    let x=M;
    lines.forEach((column,index)=>{
      if(index%2===0)canvas.page.drawRectangle({x,y:canvas.y-height,width:widths[index],height,color:canvas.colours.PAPER});
      column.forEach((line,lineIndex)=>canvas.at(line,x+padding,canvas.y-padding-9-lineIndex*12,9,index%2===0?canvas.bold:canvas.regular,index%2===0?canvas.colours.MUTED:canvas.colours.INK));
      x+=widths[index];
      if(index<lines.length-1)canvas.page.drawLine({start:{x,y:canvas.y},end:{x,y:canvas.y-height},thickness:.4,color:canvas.colours.LINE});
    });
    // Draw the enclosing rule last so pale label fills cannot cover the frame.
    canvas.page.drawRectangle({x:M,y:canvas.y-height,width:CW,height,borderColor:canvas.colours.LINE,borderWidth:.4});
    canvas.y-=height;
  }
  canvas.y-=8;
}

function executiveSummary(canvas:ReportCanvas){
  const {summary,challenges}=canvas.input.snapshot;
  const health=assessProjectHealth({deliverables:summary.total_deliverables,completion:summary.overall_progress,overdue:summary.overdue_deliverables,highIssues:challenges.filter(issue=>issue.severity==="high").length,criticalIssues:challenges.filter(issue=>issue.severity==="critical").length});
  const metrics=[
    ["Stage-weighted completion",`${summary.overall_progress}%`],
    ["Movement this report",progressMovement(summary.progress_gain)],
    ["Project health",health],
    ["MDR deliverables",String(summary.planned_deliverables)],
    ["Terminal-stage issued",String(summary.completed_deliverables)],
    ["Overdue deliverables",String(summary.overdue_deliverables)],
  ];
  const width=CW/3;
  const registerRows=[];
  for(let start=0;start<metrics.length;start+=3){
    const row=metrics.slice(start,start+3);
    const labels=row.map(([label])=>wrap(label,canvas.regular,9,width-20));
    const height=39+Math.max(...labels.map(lines=>lines.length))*12;
    registerRows.push({start,row,labels,height});
  }
  // The complete six-figure register is a small, indivisible document block.
  canvas.ensure(registerRows.reduce((height,row)=>height+row.height,0)+15);
  for(const {start,row,labels,height} of registerRows){
    if(start===0)canvas.page.drawLine({start:{x:M,y:canvas.y},end:{x:W-M,y:canvas.y},thickness:.6,color:canvas.colours.LINE});
    canvas.page.drawLine({start:{x:M,y:canvas.y-height},end:{x:W-M,y:canvas.y-height},thickness:.5,color:canvas.colours.LINE});
    row.forEach(([,value],index)=>{
      const x=M+index*width;
      canvas.page.drawLine({start:{x,y:canvas.y},end:{x,y:canvas.y-height},thickness:.4,color:canvas.colours.LINE});
      const valueLines=wrap(value,canvas.bold,17,width-20);
      valueLines.forEach((line,lineIndex)=>canvas.at(line,x+10,canvas.y-23-lineIndex*19,17,canvas.bold,canvas.colours.GRAPHITE));
      labels[index].forEach((line,lineIndex)=>canvas.at(line,x+10,canvas.y-height+12+(labels[index].length-1-lineIndex)*12,9,canvas.regular,canvas.colours.MUTED));
    });
    canvas.page.drawLine({start:{x:W-M,y:canvas.y},end:{x:W-M,y:canvas.y-height},thickness:.4,color:canvas.colours.LINE});
    canvas.y-=height;
  }
  canvas.y-=15;
}

function sCurve(canvas:ReportCanvas){
  const {snapshot,report}=canvas.input;
  const progress=projectSCurveProgress(snapshot.s_curve,snapshot.summary.planned_deliverables);
  if(progress.length<2){
    canvas.section("Schedule performance","Project delivery S-curve");
    canvas.paragraph("Not enough saved weekly data is available to draw an S-curve. No curve or historical values have been inferred.",{color:canvas.colours.MUTED});
    return;
  }
  const latestActual=[...progress].reverse().find(point=>point.actual!==null);
  const chartDates=`Plan: ${date(progress[0].date)} - ${date(progress.at(-1)!.date)}. Weekly actual through: ${latestActual?date(latestActual.date):"not recorded"}.`;
  const weekly=latestActual?.actual===null||latestActual?.actual===undefined?"not recorded":`${percentage(latestActual.actual)} at ${date(latestActual.date)}`;
  const comparison=`Latest saved weekly actual: ${weekly}. Snapshot completion: ${snapshot.summary.overall_progress}% captured ${timestamp(report.generatedAt)}.`;
  const explanation="The snapshot and weekly series can represent different dates. Saved weekly values are shown unchanged; no historical values are inferred. Actual progress reaches 100% at the project's terminal issue.";
  const chartHeight=145;
  const required=43+wrap(chartDates,canvas.regular,9,CW).length*13+15+10+chartHeight+54+wrap(comparison,canvas.regular,9,CW).length*13+5+wrap(explanation,canvas.regular,9,CW).length*13+17;
  // Keep the plot and its date/summary explanation together on an early page.
  canvas.ensure(required);
  canvas.section("Schedule performance","Project delivery S-curve");
  canvas.paragraph(chartDates,{size:9,color:canvas.colours.MUTED,leading:13,after:15});
  const x=M+36,width=CW-46,height=chartHeight,top=canvas.y-10,bottom=top-height;
  const first=new Date(`${progress[0].date}T00:00:00Z`).getTime(),last=new Date(`${progress.at(-1)!.date}T00:00:00Z`).getTime();
  const px=(value:string)=>x+(new Date(`${value}T00:00:00Z`).getTime()-first)/Math.max(1,last-first)*width;
  const py=(value:number)=>bottom+value/100*height;
  canvas.page.drawRectangle({x,y:bottom,width,height,color:canvas.colours.PAPER});
  for(const value of [0,25,50,75,100]){
    canvas.page.drawLine({start:{x,y:py(value)},end:{x:x+width,y:py(value)},thickness:.5,color:canvas.colours.LINE});
    canvas.at(`${value}%`,x-7,py(value)-3,9,canvas.regular,canvas.colours.MUTED,"right");
  }
  for(let index=1;index<progress.length;index++){
    const previous=progress[index-1],current=progress[index];
    canvas.page.drawLine({start:{x:px(previous.date),y:py(previous.planned)},end:{x:px(current.date),y:py(current.planned)},thickness:1.7,color:canvas.colours.PLANNED,dashArray:[5,3]});
    if(previous.actual!==null&&current.actual!==null)canvas.page.drawLine({start:{x:px(previous.date),y:py(previous.actual)},end:{x:px(current.date),y:py(current.actual)},thickness:2.3,color:canvas.colours.TEAL});
  }
  // Mark only sampled dates and the latest actual, keeping multi-year charts legible.
  const tickCount=Math.min(5,progress.length);
  const tickIndices=[...new Set(Array.from({length:tickCount},(_,index)=>Math.round(index*(progress.length-1)/Math.max(1,tickCount-1))))];
  for(const index of tickIndices){
    const point=progress[index],label=shortDate(point.date,progress[0].date.slice(0,4)!==progress.at(-1)!.date.slice(0,4)),labelWidth=canvas.regular.widthOfTextAtSize(label,9);
    canvas.at(label,Math.min(x+width-labelWidth,Math.max(x,px(point.date)-labelWidth/2)),bottom-17,9,canvas.regular,canvas.colours.MUTED);
    canvas.page.drawCircle({x:px(point.date),y:py(point.planned),size:2.2,color:canvas.colours.PLANNED});
    if(point.actual!==null)canvas.page.drawRectangle({x:px(point.date)-2.2,y:py(point.actual)-2.2,width:4.4,height:4.4,color:canvas.colours.TEAL});
  }
  if(latestActual?.actual!==null&&latestActual?.actual!==undefined){
    canvas.page.drawRectangle({x:px(latestActual.date)-2.7,y:py(latestActual.actual)-2.7,width:5.4,height:5.4,color:canvas.colours.TEAL});
  }
  const legend=bottom-37;
  canvas.page.drawLine({start:{x,y:legend+3},end:{x:x+24,y:legend+3},thickness:1.7,color:canvas.colours.PLANNED,dashArray:[5,3]});
  canvas.at("Planned (dashed)",x+31,legend,9,canvas.regular,canvas.colours.MUTED);
  canvas.page.drawLine({start:{x:x+172,y:legend+3},end:{x:x+196,y:legend+3},thickness:2.3,color:canvas.colours.TEAL});
  canvas.page.drawRectangle({x:x+181,y:legend+.5,width:5,height:5,color:canvas.colours.TEAL});
  canvas.at("Weekly actual (solid)",x+203,legend,9,canvas.regular,canvas.colours.MUTED);
  canvas.y=legend-17;
  canvas.paragraph(comparison,{size:9,leading:13,color:canvas.colours.GRAPHITE,after:5});
  canvas.paragraph(explanation,{size:9,leading:13,color:canvas.colours.MUTED,after:17});
}

function disciplinePerformance(canvas:ReportCanvas){
  const snapshot=canvas.input.snapshot;
  canvas.section("Performance detail","Discipline delivery position");
  canvas.paragraph("Stage-weighted completion is taken from the saved DCC-accepted milestone figures. Terminal variance compares terminal-stage issues with final milestones due at the cut-off.",{color:canvas.colours.MUTED});
  if(!snapshot.disciplines.length){canvas.paragraph("No active MDR deliverables were recorded in this snapshot.",{color:canvas.colours.MUTED});return;}
  const panels=[];
  for(let index=0;index<snapshot.discipline_columns.length;index+=3)panels.push(snapshot.discipline_columns.slice(index,index+3));
  for(const [index,panel] of panels.entries()){
    const width=(CW-150)/panel.length;
    canvas.table([{label:"Discipline",width:150},...panel.map(column=>({label:disciplineReportColumnLabel(column),width,align:"right" as const}))],snapshot.disciplines.map(row=>[row.discipline,...panel.map(column=>({text:disciplineReportValue(row,column),warning:(column==="weekly_variance"||column==="project_variance")&&row[column]<0}))]),`Selected metrics ${index+1} of ${panels.length}`);
  }
}

function groupedRows<T extends {discipline:string}>(rows:T[]){
  const groups=new Map<string,T[]>();
  for(const row of rows){const group=groups.get(row.discipline)??[];group.push(row);groups.set(row.discipline,group);}
  return [...groups].sort(([left],[right])=>left.localeCompare(right));
}

function registers(canvas:ReportCanvas){
  const snapshot=canvas.input.snapshot;
  const issuedColumns=[{label:"Issued date",width:75},{label:"Document number and title",width:235},{label:"Rev.",width:47},{label:"Issue purpose",width:CW-357}];
  const issuedGroups=groupedRows(snapshot.weekly_issued_deliverables);
  const issuedRow=(item:ProjectReportSnapshot["weekly_issued_deliverables"][number])=>[date(new Date(item.issued_at).toISOString().slice(0,10)),`${item.document_number}\n${item.title}`,item.revision_code,item.issue_status];
  const issuedCaption=(discipline:string,count:number)=>`${discipline} | ${count} deliverable${count===1?"":"s"}`;
  const firstIssued=issuedGroups[0];
  if(firstIssued)canvas.ensure(43+38+canvas.tableStartHeight(issuedColumns,issuedRow(firstIssued[1][0]),issuedCaption(firstIssued[0],firstIssued[1].length)));
  canvas.section("Reporting period","Issued deliverables");
  canvas.paragraph(`Stage issues this week: ${snapshot.summary.weekly_acceptances}. Final milestones due: ${snapshot.summary.weekly_due}. Terminal-stage issued to date: ${snapshot.summary.completed_deliverables}.`,{color:canvas.colours.MUTED});
  if(!snapshot.weekly_issued_deliverables.length)canvas.paragraph("No deliverable was issued during this reporting period.",{color:canvas.colours.MUTED});
  for(const [discipline,items] of issuedGroups){
    canvas.table(issuedColumns,items.map(issuedRow),issuedCaption(discipline,items.length));
  }
  const plannedColumns=[{label:"Planned date",width:75},{label:"Document number and title",width:210},{label:"Responsible",width:110},{label:"Required issue",width:CW-395}];
  const plannedGroups=groupedRows(snapshot.lookahead);
  const plannedRow=(item:ProjectReportSnapshot["lookahead"][number])=>[date(item.planned_submission_date),`${item.document_number}\n${item.title}`,item.responsible_party??"Unassigned",item.required_issue_status??"Not specified"];
  const firstPlanned=plannedGroups[0];
  if(firstPlanned)canvas.ensure(43+canvas.tableStartHeight(plannedColumns,plannedRow(firstPlanned[1][0]),issuedCaption(firstPlanned[0],firstPlanned[1].length)));
  canvas.section("Next week look-ahead","Planned deliverable submissions");
  if(!snapshot.lookahead.length)canvas.paragraph("No MDR submission is planned in the next seven days.",{color:canvas.colours.MUTED});
  for(const [discipline,items] of plannedGroups){
    canvas.table(plannedColumns,items.map(plannedRow),issuedCaption(discipline,items.length));
  }
}

function challenges(canvas:ReportCanvas){
  if(canvas.input.snapshot.challenges.length)canvas.ensure(150);
  canvas.section("Challenges and actions","Open project issues");
  if(!canvas.input.snapshot.challenges.length){canvas.paragraph("No open project challenge was recorded at generation time.",{color:canvas.colours.MUTED});return;}
  for(const issue of canvas.input.snapshot.challenges){
    canvas.ensure(75);
    canvas.page.drawRectangle({x:M,y:canvas.y-8,width:3,height:3,color:canvas.colours.MUTED});
    canvas.paragraph(`${issue.severity.toUpperCase()} | ${issue.title}`,{size:10,font:canvas.bold,color:canvas.colours.GRAPHITE,leading:14,after:4,indent:10});
    canvas.paragraph(`Owner: ${issue.owner_name??"Unassigned"} | Target: ${date(issue.due_date)}`,{size:9,color:canvas.colours.MUTED,leading:13,after:4,indent:10});
    if(issue.description)canvas.paragraph(issue.description,{after:10,indent:10});
  }
}

function appendix(canvas:ReportCanvas){
  const snapshot=canvas.input.snapshot;
  canvas.section("Project reference","Brief, objectives and dates");
  canvas.paragraph(`Planned start: ${date(snapshot.identity.planned_start_date)} | Planned completion: ${date(snapshot.identity.planned_end_date)}`,{font:canvas.bold});
  canvas.subheading("Project introduction");
  canvas.boxedParagraph(snapshot.identity.project_introduction??"No project introduction was recorded when this snapshot was generated.");
  canvas.subheading("Key objectives");
  if(!snapshot.identity.key_objectives.length)canvas.paragraph("No key objectives were recorded when this snapshot was generated.",{color:canvas.colours.MUTED});
  snapshot.identity.key_objectives.forEach((objective,index)=>canvas.paragraph(`${index+1}. ${objective}`,{after:5}));
  if(snapshot.s_curve.disciplines.length){
    const columns:Column[]=[{label:"Discipline",width:150},{label:"Planned scope",width:90,align:"right"},{label:"Terminal issued",width:95,align:"right"},{label:"Variance",width:80,align:"right"},{label:"Actual %",width:CW-415,align:"right"}];
    const rows=snapshot.s_curve.disciplines.map(row=>[row.discipline,String(row.planned),String(row.completed),{text:row.variance>0?`+${row.variance}`:String(row.variance),warning:row.variance<0},`${row.completion_percent}%`]);
    canvas.ensure(43+canvas.tableStartHeight(columns,rows[0]));
    canvas.section("Terminal milestone detail","Discipline scope and variance");
    canvas.table(columns,rows);
  }
}

/** Versioned presentation only. The saved snapshot and all calculations remain unchanged. */
export async function buildProjectReportPdfV2(input:BuildInput){
  const pdf=await PDFDocument.create();
  pdf.setTitle(`${input.snapshot.identity.project_code} ${projectReportNumber(input.report.reportNumber)} - Weekly Project Progress Report`);
  pdf.setAuthor("EngiCite");pdf.setCreator("EngiCite Project Reporting");pdf.setProducer("EngiCite");
  pdf.setSubject("Controlled weekly project progress report - layout version 2");pdf.setCreationDate(new Date(input.report.generatedAt));
  const canvas=new ReportCanvas(pdf,await pdf.embedFont(StandardFonts.Helvetica),await pdf.embedFont(StandardFonts.HelveticaBold),input);
  await cover(canvas);executiveSummary(canvas);sCurve(canvas);
  disciplinePerformance(canvas);registers(canvas);challenges(canvas);appendix(canvas);canvas.footer();
  return pdf.save();
}
