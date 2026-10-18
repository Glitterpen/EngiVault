"use client";

import {useEffect,useId,useMemo,useRef,useState,type PointerEvent} from "react";
import {ArrowLeft,ArrowRight} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";
import styles from "./project-delivery-curve.module.css";

const LEFT=44,RIGHT=18,TOP=20,BOTTOM=34;
const percent=(value:number)=>`${Number.isInteger(value)?value:value.toFixed(1)}%`;
const percentage=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const dayTime=(date:string)=>Date.parse(`${date}T00:00:00Z`);
function validDate(date:string){const time=dayTime(date);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date;}
function dateLabel(date:string,short=false){return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:short?"2-digit":"numeric",timeZone:"UTC"});}
const sourceLabel=(source:DeliveryCurvePoint["submittedSource"])=>source==="live"?"Live MDR":source==="report"?"Saved report":"—";

/** Timeline-only estimates and observed progress; no fetching or project date changes. */
export function ProjectDeliveryCurve({curve}:{curve:DeliveryCurveModel}){
  const id=useId();
  const configured=curve.timeline.status==="configured"&&curve.timeline.plannedStart&&curve.timeline.plannedEnd;
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5">
      <div className="min-w-0"><div className="flex items-center gap-2"><h2 id={`${id}-heading`} className="font-semibold">Project delivery S-curve</h2><HelpTip label="About the project delivery S-curve">
        <span className="block">Submitted progress includes completed submissions awaiting DCC review; accepted progress counts DCC-accepted milestones only. Both are stage-weighted, not file counts.</span>
        <span className="mt-2 block">The estimated plan spreads progress evenly across the Project Manager’s dates, not an approved MDR baseline. Gaps are percentage points, not days of delay; actual lines join recorded snapshots only.</span>
      </HelpTip></div><p className="mt-1 text-xs leading-5 text-[#526675]">{configured?`PM timeline · ${dateLabel(curve.timeline.plannedStart!)} – ${dateLabel(curve.timeline.plannedEnd!)}`:curve.timeline.status==="invalid"?"PM timeline · Needs correction":"PM timeline · Not set"}</p></div>
      <p className="text-xs leading-5 text-[#526675]">Live snapshot · {new Date(curve.asOf).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"UTC"})} UTC</p>
    </header>
    <TimelineNotice curve={curve}/>
    {!curve.hasScope?<p className="px-4 py-8 text-sm text-[#526675] sm:px-5">Add MDR deliverables to start tracking submitted and DCC-accepted progress.</p>:<CurveExplorer curve={curve}/>}
  </section>;
}

function CurveExplorer({curve}:{curve:DeliveryCurveModel}){
  const id=useId(),container=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(640),[selectedDate,setSelectedDate]=useState<string|null>(null);
  const asOfDate=curve.asOf.slice(0,10);
  const points=useMemo(()=>curve.points.filter(point=>validDate(point.date)).map(point=>({
    ...point,
    planned:curve.timeline.status==="configured"?percentage(point.planned):null,
    submitted:point.date<=asOfDate&&(point.submittedSource==="live"||point.submittedSource==="report"&&curve.historyAvailable)?percentage(point.submitted):null,
    accepted:point.date<=asOfDate&&(point.acceptedSource==="live"||point.acceptedSource==="report"&&curve.historyAvailable)?percentage(point.accepted):null,
  })).sort((a,b)=>a.date.localeCompare(b.date)),[curve.points,curve.historyAvailable,curve.timeline.status,asOfDate]);
  const hasPoints=points.length>0;
  useEffect(()=>{
    const target=container.current;
    if(!target||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(entries=>{const measured=Math.floor(entries[0]?.contentRect.width??0);if(measured>0)setWidth(previous=>previous===measured?previous:measured);});
    observer.observe(target);return ()=>observer.disconnect();
  },[hasPoints]);

  if(!hasPoints)return <p className="px-4 py-8 text-sm text-[#526675] sm:px-5">The progress curve is unavailable. Refresh progress to try again.</p>;
  const latestObservation=points.findLastIndex(point=>point.submitted!==null||point.accepted!==null);
  const requested=selectedDate===null?-1:points.findIndex(point=>point.date===selectedDate);
  const index=requested<0?(latestObservation<0?points.length-1:latestObservation):requested,selected=points[index];
  const height=width<520?228:264,plotWidth=Math.max(1,width-LEFT-RIGHT),plotHeight=height-TOP-BOTTOM;
  const first=validDate(curve.timeline.displayStart)?dayTime(curve.timeline.displayStart):dayTime(points[0].date);
  const last=validDate(curve.timeline.displayEnd)?Math.max(first,dayTime(curve.timeline.displayEnd)):Math.max(first,dayTime(points.at(-1)!.date)),span=last-first;
  const x=(date:string)=>span?LEFT+(dayTime(date)-first)/span*plotWidth:LEFT+plotWidth/2;
  const y=(value:number)=>TOP+(1-value/100)*plotHeight;
  const planned=points.filter(point=>point.planned!==null),submitted=points.filter(point=>point.submitted!==null),accepted=points.filter(point=>point.accepted!==null);
  const sameDayPlan=curve.timeline.plannedStart===curve.timeline.plannedEnd;
  const plannedPath=sameDayPlan?milestonePath(planned,x,y):linePath(planned,"planned",x,y),submittedPath=linePath(submitted,"submitted",x,y),acceptedPath=linePath(accepted,"accepted",x,y);
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
  const label=`${dateLabel(selected.date)}; estimated plan ${value(selected,"planned").toLowerCase()}; overall submitted ${value(selected,"submitted").toLowerCase()}; DCC accepted ${value(selected,"accepted").toLowerCase()}`;
  const acceptedVariance=curve.timeline.status==="configured"?curve.estimatedPlan.acceptedVariance:null;
  const weeklyRate=curve.timeline.status==="configured"?curve.estimatedPlan.weeklyRate:null;
  return <div className="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5">
    <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#526675]"><span className="inline-flex items-center gap-2"><span className={styles.plannedKey} aria-hidden="true"/>Estimated plan</span><span className="inline-flex items-center gap-2"><span className={styles.submittedKey} aria-hidden="true"/>Overall submitted</span><span className="inline-flex flex-wrap items-center gap-2"><span className={styles.acceptedKey} style={{borderTopColor:acceptedColor}} aria-hidden="true"/><span>DCC accepted</span><span className="font-medium" style={{color:acceptedColor}}>· {progressStatusLabel}</span></span></div>
    </div>
    {weeklyRate!==null&&<p className="text-xs leading-5 text-[#526675]">Linear estimate · approximately {numberLabel(weeklyRate)}% per week</p>}
    <figure className="min-w-0">
      <p id={`${id}-description`} className="sr-only">Slate dashed estimated plan assumes equal calendar-day progress from the Project Manager’s planned start at 0% to planned completion at 100%; it is not an approved MDR baseline. Orange dashed overall submitted progress and solid DCC-accepted progress connect their own recorded observations only. DCC accepted is red below today’s plan, green when achieved, or navy when comparison is unavailable. The larger endpoint marks current accepted progress; decorative motion does not change values. Missing observations are not zero; actual lines never forecast future progress. The Today marker identifies the current snapshot date. Exact estimates, actual values and independent actual sources are available using Explore curve dates or View curve data.</p>
      <div ref={container} role="img" aria-label="Estimated plan, submitted and DCC-accepted progress S-curve" aria-describedby={`${id}-description`} className={styles.plot} style={{height}} onPointerDown={selectAtPointer}>
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
        <svg className={styles.cursorLayer} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
          <line x1={x(selected.date)} x2={x(selected.date)} y1={TOP} y2={TOP+plotHeight} stroke="#526675" strokeOpacity=".4" strokeDasharray="3 5"/>
          {selected.planned!==null&&<circle cx={x(selected.date)} cy={y(selected.planned)} r={4} fill="white" stroke="#647386" strokeWidth={2}/>}
          {selected.submitted!==null&&<circle cx={x(selected.date)} cy={y(selected.submitted)} r={4} fill="white" stroke="#b94d20" strokeWidth={2}/>}
          {selected.accepted!==null&&<circle cx={x(selected.date)} cy={y(selected.accepted)} r={5} fill="white" stroke={acceptedColor} strokeWidth={2.5}/>}
        </svg>
        {currentAccepted&&<div className={styles.progressMotion} style={{color:acceptedColor}} aria-hidden="true">
          {accepted.length>1&&<span data-curve-traveller className={styles.traveller} style={{offsetPath:`path("${acceptedPath}")`}}/>}
          <span data-curve-current-marker data-date={currentAccepted.date} data-value={currentAccepted.accepted} className={styles.currentMarker} style={{left:x(currentAccepted.date),top:y(currentAccepted.accepted!),color:acceptedColor}}/>
        </div>}
      </div>
      <figcaption className="rounded-xl border border-[#dce3ec] bg-[#f7f9fc] px-3 py-3 sm:px-4">
        <div role="status" aria-live="polite" aria-atomic="true"><dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4"><SelectedDatum label="Selected date" value={dateLabel(selected.date)}/><SelectedDatum label="Estimated plan" value={value(selected,"planned")}/><SelectedDatum label="Overall submitted" value={value(selected,"submitted")} source={selected.submitted===null?undefined:sourceLabel(selected.submittedSource)}/><SelectedDatum label="DCC accepted" value={value(selected,"accepted")} source={selected.accepted===null?undefined:sourceLabel(selected.acceptedSource)}/></dl></div>
        {acceptedVariance!==null&&<p className={`mt-3 text-xs ${acceptedVariance<0?"text-[#8b3d1f]":"text-[#526675]"}`}>{acceptedVariance===0?"DCC-accepted progress matches the estimated plan today.":`DCC-accepted progress is ${numberLabel(Math.abs(acceptedVariance))} percentage points ${acceptedVariance<0?"behind":"ahead of"} the estimated plan today.`}</p>}
        <p className={`mt-3 text-xs ${curve.gap!==null&&curve.gap>0?"text-[#8b3d1f]":"text-[#526675]"}`}>{curve.gap===null?"Current pending DCC acceptance: unavailable.":curve.gap===0?"Current snapshot: no submitted-to-accepted progress gap.":curve.gap>0?`Current snapshot: ${numberLabel(curve.gap)} percentage points pending DCC acceptance.`:`Current snapshot: DCC-accepted progress is ${numberLabel(Math.abs(curve.gap))} percentage points above the submitted observation.`}</p>
      </figcaption>
    </figure>
    <div className="mt-3 min-w-0"><div className="flex items-center justify-between gap-2"><label htmlFor={`${id}-date`} className="text-xs font-semibold text-[#526675]">Explore curve dates</label><HelpTip label="Explore S-curve dates">Tap the chart or move the slider to inspect a date. With the slider focused, use Arrow keys to move or Home and End to jump to either end; “Not observed” means no snapshot was recorded.</HelpTip></div>
      <div className="flex min-w-0 items-center gap-2"><button type="button" data-preview-safe aria-label="Previous curve date" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dde4eb] text-[#10243e] disabled:opacity-40" disabled={index===0} onClick={()=>select(index-1)}><ArrowLeft size={16} aria-hidden="true"/></button>
        <input id={`${id}-date`} data-preview-safe className={styles.range} type="range" min={0} max={points.length-1} step={1} value={index} disabled={points.length===1} aria-valuetext={label} onChange={event=>select(Number(event.currentTarget.value))} onKeyDown={event=>{const next=event.key==="Home"?0:event.key==="End"?points.length-1:event.key==="ArrowLeft"||event.key==="ArrowDown"?index-1:event.key==="ArrowRight"||event.key==="ArrowUp"?index+1:null;if(next!==null){event.preventDefault();select(next);}}}/>
        <button type="button" data-preview-safe aria-label="Next curve date" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dde4eb] text-[#10243e] disabled:opacity-40" disabled={index===points.length-1} onClick={()=>select(index+1)}><ArrowRight size={16} aria-hidden="true"/></button></div>
    </div>
    <div className="mt-2 space-y-1 text-xs leading-5 text-[#526675]">
      {curve.submittedToday===null?<p>Overall submitted progress is unavailable. DCC-accepted progress remains visible.</p>:submitted.length<2?<p>Overall submitted trend will appear when submitted-progress snapshots are available. No earlier submitted values have been assumed.</p>:null}
      {!curve.historyAvailable?<p>Saved report history is unavailable. Current observations are still shown.</p>:accepted.length<2?<p>DCC-accepted trend will appear as project reports are saved.</p>:null}
      {curve.invalidHistoryCount>0&&<p>{curve.invalidHistoryCount} saved report {curve.invalidHistoryCount===1?"snapshot could":"snapshots could"} not be plotted.</p>}
    </div>
    <details className="mt-3 border-t border-[#e7ecef]"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-[#10243e]">View curve data</summary><div role="region" aria-label="S-curve data — scroll horizontally for all columns" tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg border border-[#dce3ec]"><table className="w-full min-w-[760px] text-left text-xs"><caption className="sr-only">Estimated plan, submitted and DCC-accepted progress data</caption><thead className="bg-[#f1f5fa] text-[#526675]"><tr>{["Date","Estimated plan","Overall submitted","DCC accepted","Submitted source","Accepted source"].map(column=><th key={column} scope="col" className="px-3 py-3 font-semibold">{column}</th>)}</tr></thead><tbody>{points.map(point=><tr key={point.date} className="border-t border-[#e7ecef]"><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium">{dateLabel(point.date)}</th><td className="px-3 py-3">{value(point,"planned")}</td><td className="px-3 py-3">{value(point,"submitted")}</td><td className="px-3 py-3">{value(point,"accepted")}</td><td className="px-3 py-3">{point.submitted===null?"—":sourceLabel(point.submittedSource)}</td><td className="px-3 py-3">{point.accepted===null?"—":sourceLabel(point.acceptedSource)}</td></tr>)}</tbody></table></div></details>
  </div>;
}

function SelectedDatum({label,value,source}:{label:string;value:string;source?:string}){return <div className="min-w-0"><dt className="text-xs leading-5 text-[#526675]">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold tabular-nums text-[#10243e]"><span>{value}</span>{source&&<span className="mt-0.5 block text-[11px] font-normal text-[#526675]">{source}</span>}</dd></div>;}
function TimelineNotice({curve}:{curve:DeliveryCurveModel}){
  const {timeline}=curve;
  const notice=timeline.status==="missing"?"PM timeline is not set. Ask the Project Manager to set the planned start and completion dates; no project schedule is assumed.":timeline.status==="invalid"?"PM timeline needs correction. Ask the Project Manager to check the planned start and completion dates; no project schedule is assumed.":timeline.plannedEnd&&timeline.plannedEnd<curve.asOf.slice(0,10)?`The snapshot is after PM planned completion (${dateLabel(timeline.plannedEnd)}). The displayed period extends to ${dateLabel(curve.asOf.slice(0,10))}; project dates have not been changed.`:null;
  return notice?<p className="px-4 pt-3 text-xs leading-5 text-[#526675] sm:px-5">{notice}</p>:null;
}
function numberLabel(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}
function linePath(points:DeliveryCurvePoint[],field:"planned"|"submitted"|"accepted",x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>`${index?"L":"M"} ${Number(x(point.date).toFixed(2))} ${Number(y(point[field]!).toFixed(2))}`).join(" ");}
function milestonePath(points:DeliveryCurvePoint[],x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>{const horizontal=Number(x(point.date).toFixed(2)),vertical=Number(y(point.planned!).toFixed(2));return index?`H ${horizontal}${point.planned!==points[index-1].planned?` V ${vertical}`:""}`:`M ${horizontal} ${vertical}`;}).join(" ");}
