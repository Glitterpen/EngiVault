"use client";

import {useEffect,useId,useMemo,useRef,useState,type PointerEvent} from "react";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";
import styles from "./project-delivery-curve.module.css";

const LEFT=44,RIGHT=18,TOP=20,BOTTOM=34;
const percent=(value:number)=>`${Number.isInteger(value)?value:value.toFixed(1)}%`;
const percentage=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const dayTime=(date:string)=>Date.parse(`${date}T00:00:00Z`);
function validDate(date:string){const time=dayTime(date);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date;}
function dateLabel(date:string,short=false){return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:short?"2-digit":"numeric",timeZone:"UTC"});}
const sourceLabel=(source:DeliveryCurvePoint["submittedSource"])=>source==="live"?"Live MDR":source==="snapshot"?"Daily snapshot":source==="report"?"Saved report":"—";

/** Approved milestone planning and observed progress; no fetching or project changes. */
export function ProjectDeliveryCurve({curve}:{curve:DeliveryCurveModel}){
  const id=useId();
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <h2 id={`${id}-heading`} className="sr-only">Project delivery S-curve</h2>
    {!curve.hasScope?<p role="status" className="px-4 py-8 text-sm text-[#526675]">No MDR deliverables yet.</p>:<CurveExplorer curve={curve}/>}
  </section>;
}

function CurveExplorer({curve}:{curve:DeliveryCurveModel}){
  const id=useId(),container=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(640),[selectedDate,setSelectedDate]=useState<string|null>(null),[inspecting,setInspecting]=useState(false);
  const asOfDate=curve.asOf.slice(0,10);
  const points=useMemo(()=>curve.points.filter(point=>validDate(point.date)).map(point=>({
    ...point,
    planned:curve.timeline.status==="configured"?percentage(point.planned):null,
    submitted:point.date<=asOfDate&&(point.submittedSource==="live"||(point.submittedSource==="report"||point.submittedSource==="snapshot")&&curve.historyAvailable)?percentage(point.submitted):null,
    accepted:point.date<=asOfDate&&(point.acceptedSource==="live"||(point.acceptedSource==="report"||point.acceptedSource==="snapshot")&&curve.historyAvailable)?percentage(point.accepted):null,
  })).sort((a,b)=>a.date.localeCompare(b.date)),[curve.points,curve.historyAvailable,curve.timeline.status,asOfDate]);
  const hasPoints=points.length>0;
  useEffect(()=>{
    const target=container.current;
    if(!target||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(entries=>{const measured=Math.floor(entries[0]?.contentRect.width??0);if(measured>0)setWidth(previous=>previous===measured?previous:measured);});
    observer.observe(target);return ()=>observer.disconnect();
  },[hasPoints]);

  if(!hasPoints)return <p role="status" className="px-4 py-8 text-sm text-[#526675]">Progress unavailable.</p>;
  const latestObservation=points.findLastIndex(point=>point.submitted!==null||point.accepted!==null);
  const requested=selectedDate===null?-1:points.findIndex(point=>point.date===selectedDate);
  const index=requested<0?(latestObservation<0?points.length-1:latestObservation):requested,selected=points[index];
  const height=width<520?228:264,plotWidth=Math.max(1,width-LEFT-RIGHT),plotHeight=height-TOP-BOTTOM;
  const first=validDate(curve.timeline.displayStart)?dayTime(curve.timeline.displayStart):dayTime(points[0].date);
  const last=validDate(curve.timeline.displayEnd)?Math.max(first,dayTime(curve.timeline.displayEnd)):Math.max(first,dayTime(points.at(-1)!.date)),span=last-first;
  const x=(date:string)=>span?LEFT+(dayTime(date)-first)/span*plotWidth:LEFT+plotWidth/2;
  const y=(value:number)=>TOP+(1-value/100)*plotHeight;
  const planned=points.filter(point=>point.planned!==null),submitted=points.filter(point=>point.submitted!==null),accepted=points.filter(point=>point.accepted!==null);
  const plannedPath=milestonePath(planned,x,y),submittedPath=linePath(submitted,"submitted",x,y),acceptedPath=linePath(accepted,"accepted",x,y);
  // Decorative motion follows only real accepted observations, ending at today's live snapshot.
  const currentAccepted=accepted.findLast(point=>point.date===asOfDate&&point.acceptedSource==="live");
  const planToday=curve.timeline.status==="configured"?percentage(curve.estimatedPlan.today):null;
  const progressStatus=currentAccepted&&planToday!==null?(currentAccepted.accepted!<planToday?"behind":"achieved"):"unavailable";
  const acceptedColor=progressStatus==="behind"?"#b91c1c":progressStatus==="achieved"?"#15803d":"#10243e";
  const progressStatusLabel=progressStatus==="behind"?"Below plan":progressStatus==="achieved"?"Plan achieved":"Plan comparison unavailable";
  // Axis ticks use equal elapsed UTC time, never clustered observation indices.
  const tickCount=span?Math.min(width<600?3:5,Math.floor(span/86_400_000)+1):1;
  const ticks=Array.from({length:tickCount},(_,tick)=>first+span*tick/Math.max(1,tickCount-1));
  const plannedEnd=curve.timeline.status==="configured"&&curve.timeline.plannedEnd&&validDate(curve.timeline.plannedEnd)?curve.timeline.plannedEnd:null;
  const afterCompletion=plannedEnd!==null&&plannedEnd<asOfDate;
  const select=(next:number)=>setSelectedDate(points[Math.max(0,Math.min(points.length-1,next))].date);
  const selectAtPointer=(event:PointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();if(!rect.width||!Number.isFinite(event.clientX))return;
    const ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*width-LEFT)/plotWidth)),target=first+ratio*span;
    let nearest=0;for(let candidate=1;candidate<points.length;candidate++)if(Math.abs(dayTime(points[candidate].date)-target)<Math.abs(dayTime(points[nearest].date)-target))nearest=candidate;
    select(nearest);
  };
  const value=(point:DeliveryCurvePoint,field:"planned"|"submitted"|"accepted")=>point[field]!==null?percent(point[field]!):field==="planned"||point.date===asOfDate?"Unavailable":"Not observed";
  const inspectionWidth=Math.min(232,Math.max(1,width-12));
  const inspectionLeft=Math.max(6,Math.min(width-inspectionWidth-6,x(selected.date)-inspectionWidth/2));
  const inspectionTop=y(selected.accepted??selected.submitted??selected.planned??0)<TOP+plotHeight/2?Math.max(TOP+4,height-BOTTOM-108):TOP+4;
  return <div className="min-w-0 px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
    <div className="flex min-h-9 flex-wrap items-center gap-x-5 gap-y-2 py-1 text-xs text-[#526675]" data-curve-legend>
      <span className="inline-flex items-center gap-2"><span className={styles.plannedKey} aria-hidden="true"/>Approved plan</span><span className="inline-flex items-center gap-2"><span className={styles.submittedKey} aria-hidden="true"/>Overall submitted</span><span className="inline-flex items-center gap-2"><span className={styles.acceptedKey} style={{borderTopColor:acceptedColor}} aria-hidden="true"/><span>DCC accepted</span><span className="sr-only">{progressStatusLabel}</span></span>
    </div>
    <figure className="min-w-0">
      <p id={`${id}-description`} className="sr-only">Slate dashed approved plan earns frozen weighted milestone credit on each approved date. Orange dashed overall submitted progress and solid DCC-accepted progress join recorded observations only. Red is below today’s approved plan; green is achieved; navy means comparison unavailable. {curve.timeline.status==="configured"&&curve.timeline.plannedStart&&curve.timeline.plannedEnd?`Planned period: ${dateLabel(curve.timeline.plannedStart)} to ${dateLabel(curve.timeline.plannedEnd)}.`:"Planned dates unavailable."} Focus the chart and use Arrow keys, Home or End to inspect dates; Escape dismisses values. Missing observations are not zero.</p>
      <div ref={container} role="img" tabIndex={0} data-preview-safe data-inspecting={inspecting} aria-label="Approved plan, submitted and DCC-accepted progress S-curve" aria-describedby={`${id}-description ${id}-selection`} className={styles.plot} style={{height}}
        onFocus={()=>setInspecting(true)} onBlur={()=>setInspecting(false)}
        onPointerMove={event=>{if(event.pointerType!=="touch"){setInspecting(true);selectAtPointer(event);}}}
        onPointerLeave={event=>{if(event.pointerType!=="touch")setInspecting(false);}}
        onPointerDown={event=>{event.currentTarget.focus({preventScroll:true});setInspecting(true);selectAtPointer(event);}}
        onKeyDown={event=>{if(event.key==="Escape"){setInspecting(false);return;}const next=event.key==="Home"?0:event.key==="End"?points.length-1:event.key==="ArrowLeft"||event.key==="ArrowDown"?index-1:event.key==="ArrowRight"||event.key==="ArrowUp"?index+1:null;if(next!==null){event.preventDefault();setInspecting(true);select(next);}}}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
          <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} rx={8} fill="#f7f9fc"/>
          {afterCompletion&&<rect data-curve-period="after-pm-completion" x={x(plannedEnd!)} y={TOP} width={Math.max(0,x(asOfDate)-x(plannedEnd!))} height={plotHeight} fill="#fff0e9" opacity=".65"/>}
          {[0,25,50,75,100].map(tick=><g key={tick}><line x1={LEFT} x2={width-RIGHT} y1={y(tick)} y2={y(tick)} stroke="#dce3ec"/><text x={LEFT-9} y={y(tick)+4} textAnchor="end" fill="#526675" fontSize={11}>{tick}%</text></g>)}
          {plannedEnd&&<line data-pm-completion x1={x(plannedEnd)} x2={x(plannedEnd)} y1={TOP} y2={TOP+plotHeight} stroke="#98a6b8" strokeDasharray="3 5"/>}
          <line data-today-marker x1={x(asOfDate)} x2={x(asOfDate)} y1={TOP} y2={TOP+plotHeight} stroke="#b94d20" strokeWidth={1.3} strokeDasharray="2 4"/>
          <text data-today-label x={x(asOfDate)} y={12} textAnchor={x(asOfDate)<LEFT+30?"start":x(asOfDate)>width-RIGHT-30?"end":"middle"} fill="#b94d20" fontSize={11} fontWeight={600}>Today</text>
          {ticks.map((time,tick)=><text data-axis-date key={time} x={span?LEFT+(time-first)/span*plotWidth:LEFT+plotWidth/2} y={height-10} textAnchor={ticks.length===1?"middle":tick===0?"start":tick===ticks.length-1?"end":"middle"} fill="#526675" fontSize={11}>{dateLabel(new Date(time).toISOString().slice(0,10),true)}</text>)}
        </svg>
        <div data-curve-traces data-progress-status={progressStatus} className={styles.traceLayer}>
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
            <defs><linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={acceptedColor} stopOpacity=".12"/><stop offset="100%" stopColor={acceptedColor} stopOpacity=".01"/></linearGradient></defs>
            {accepted.length>1&&<path d={`${acceptedPath} L ${x(accepted.at(-1)!.date)} ${y(0)} L ${x(accepted[0].date)} ${y(0)} Z`} fill={`url(#${id}-fill)`}/>}
            {planned.length>1&&<path data-curve-series="planned" d={plannedPath} fill="none" stroke="#647386" strokeWidth={2.2} strokeDasharray="10 4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
            {planned.filter(point=>planned.length<60||point.date===asOfDate||point.date===curve.timeline.plannedStart||point.date===plannedEnd).map(point=><circle key={point.date} data-curve-series="planned-point" cx={x(point.date)} cy={y(point.planned!)} r={2.5} fill="white" stroke="#647386" strokeWidth={1.5}/>)}
            {submitted.length>1&&<path data-curve-series="submitted" d={submittedPath} fill="none" stroke="#b94d20" strokeWidth={2.2} strokeDasharray="6 6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
            {accepted.length>1&&<path data-curve-series="accepted" d={acceptedPath} fill="none" stroke={acceptedColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
            {submitted.filter(point=>submitted.length<12||point.submittedSource==="live").map(point=><circle key={point.date} data-curve-series="submitted-point" data-source={point.submittedSource} cx={x(point.date)} cy={y(point.submitted!)} r={point.submittedSource==="live"?5:3} fill="white" stroke="#b94d20" strokeWidth={2}/>)}
            {accepted.filter(point=>accepted.length<12||point.acceptedSource==="live").map(point=><circle key={point.date} data-curve-series="accepted-point" data-source={point.acceptedSource} cx={x(point.date)} cy={y(point.accepted!)} r={point.acceptedSource==="live"?5:3} fill={point.acceptedSource==="live"?acceptedColor:"white"} stroke={acceptedColor} strokeWidth={2}/>)}
          </svg>
        </div>
        {inspecting&&<svg className={styles.cursorLayer} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
          <line x1={x(selected.date)} x2={x(selected.date)} y1={TOP} y2={TOP+plotHeight} stroke="#526675" strokeOpacity=".4" strokeDasharray="3 5"/>
          {selected.planned!==null&&<circle cx={x(selected.date)} cy={y(selected.planned)} r={4} fill="white" stroke="#647386" strokeWidth={2}/>}
          {selected.submitted!==null&&<circle cx={x(selected.date)} cy={y(selected.submitted)} r={4} fill="white" stroke="#b94d20" strokeWidth={2}/>}
          {selected.accepted!==null&&<circle cx={x(selected.date)} cy={y(selected.accepted)} r={5} fill="white" stroke={acceptedColor} strokeWidth={2.5}/>}
        </svg>}
        {currentAccepted&&<div className={styles.progressMotion} style={{color:acceptedColor}} aria-hidden="true">
          {accepted.length>1&&<span data-curve-traveller className={styles.traveller} style={{offsetPath:`path("${acceptedPath}")`}}/>}
          <span data-curve-current-marker data-date={currentAccepted.date} data-value={currentAccepted.accepted} className={styles.currentMarker} style={{left:x(currentAccepted.date),top:y(currentAccepted.accepted!),color:acceptedColor}}/>
        </div>}
        {inspecting&&<div data-curve-inspection className={styles.inspection} style={{left:inspectionLeft,top:inspectionTop,width:inspectionWidth}} aria-hidden="true">
          <p className="mb-1 font-semibold text-[#10243e]">{dateLabel(selected.date)}</p>
          <dl>{[["Approved plan","planned"],["Overall submitted","submitted"],["DCC accepted","accepted"]].map(([name,field])=><div key={field} className="flex items-center justify-between gap-2"><dt>{name}</dt><dd className="font-semibold tabular-nums text-[#10243e]">{value(selected,field as "planned"|"submitted"|"accepted")}</dd></div>)}</dl>
        </div>}
      </div>
      <figcaption id={`${id}-selection`} data-curve-selected className="sr-only">
        <div role="status" aria-live={inspecting?"polite":"off"} aria-atomic="true"><dl><SelectedDatum label="Selected date" value={dateLabel(selected.date)}/><SelectedDatum label="Approved plan" value={value(selected,"planned")}/><SelectedDatum label="Overall submitted" value={value(selected,"submitted")} source={selected.submitted===null?undefined:sourceLabel(selected.submittedSource)}/><SelectedDatum label="DCC accepted" value={value(selected,"accepted")} source={selected.accepted===null?undefined:sourceLabel(selected.acceptedSource)}/></dl></div>
      </figcaption>
    </figure>
    <div className="sr-only" role="region" aria-label="S-curve data"><table><caption>Approved plan, submitted and DCC-accepted progress data</caption><thead><tr>{["Date","Approved plan","Overall submitted","DCC accepted","Submitted source","Accepted source"].map(column=><th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{points.map(point=><tr key={point.date}><th scope="row">{dateLabel(point.date)}</th><td>{value(point,"planned")}</td><td>{value(point,"submitted")}</td><td>{value(point,"accepted")}</td><td>{point.submitted===null?"—":sourceLabel(point.submittedSource)}</td><td>{point.accepted===null?"—":sourceLabel(point.acceptedSource)}</td></tr>)}</tbody></table></div>
  </div>;
}

function SelectedDatum({label,value,source}:{label:string;value:string;source?:string}){return <div className="min-w-0"><dt className="text-xs leading-5 text-[#526675]">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold tabular-nums text-[#10243e]"><span>{value}</span>{source&&<span className="mt-0.5 block text-[11px] font-normal text-[#526675]">{source}</span>}</dd></div>;}
function linePath(points:DeliveryCurvePoint[],field:"planned"|"submitted"|"accepted",x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>`${index?"L":"M"} ${Number(x(point.date).toFixed(2))} ${Number(y(point[field]!).toFixed(2))}`).join(" ");}
function milestonePath(points:DeliveryCurvePoint[],x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>{const horizontal=Number(x(point.date).toFixed(2)),vertical=Number(y(point.planned!).toFixed(2));return index?`H ${horizontal}${point.planned!==points[index-1].planned?` V ${vertical}`:""}`:`M ${horizontal} ${vertical}`;}).join(" ");}
