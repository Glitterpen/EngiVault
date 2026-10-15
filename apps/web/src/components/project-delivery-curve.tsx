"use client";

import {useCallback,useEffect,useId,useMemo,useRef,useState,useSyncExternalStore,type PointerEvent} from "react";
import {ArrowLeft,ArrowRight,RotateCcw} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";
import styles from "./project-delivery-curve.module.css";

const LEFT=44,RIGHT=18,TOP=20,BOTTOM=34;
const MOTION_QUERY="(prefers-reduced-motion: reduce)";
const percent=(value:number)=>`${Number.isInteger(value)?value:value.toFixed(1)}%`;
const percentage=(value:number|null)=>value!==null&&Number.isFinite(value)&&value>=0&&value<=100?value:null;
const dayTime=(date:string)=>Date.parse(`${date}T00:00:00Z`);
function dateLabel(date:string,short=false){return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:short?"2-digit":"numeric",timeZone:"UTC"});}
function motionSnapshot(){return typeof window==="undefined"||typeof window.matchMedia!=="function"||window.matchMedia(MOTION_QUERY).matches;}
const serverMotionSnapshot=()=>true;

/** A live presentation only: never changes the report/PDF baseline or fetches data. */
export function ProjectDeliveryCurve({curve}:{curve:DeliveryCurveModel}){
  const id=useId();
  return <section aria-labelledby={`${id}-heading`} className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5">
      <div className="flex items-center gap-2"><h2 id={`${id}-heading`} className="font-semibold">Project delivery S-curve</h2><HelpTip label="About the project delivery S-curve">Planned progress uses weighted final-issue dates only; missing dates are not replaced with an assumed plan. Actual history comes from saved project reports, each retaining its scope at that time. The live point uses the current MDR scope. Scope changes can move actual progress up or down. Planned steps change at dated milestones; the actual line connects observed snapshots, not daily measurements. Use the date control or data table for exact values.</HelpTip></div>
      <p className="text-xs leading-5 text-[#526675]">Live snapshot · {new Date(curve.asOf).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false,timeZone:"UTC"})} UTC</p>
    </header>
    {!curve.hasScope?<p className="px-4 py-8 text-sm text-[#526675] sm:px-5">Add MDR deliverables to start tracking the delivery curve.</p>:<CurveExplorer curve={curve}/>}
  </section>;
}

function CurveExplorer({curve}:{curve:DeliveryCurveModel}){
  const id=useId(),container=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(640),[selectedDate,setSelectedDate]=useState<string|null>(null),[replay,setReplay]=useState(0),[animationFinished,setAnimationFinished]=useState(false);
  const subscribeMotion=useCallback((notify:()=>void)=>{
    if(typeof window.matchMedia!=="function")return ()=>{};
    const media=window.matchMedia(MOTION_QUERY);
    const changed=()=>{setAnimationFinished(true);notify();};
    media.addEventListener("change",changed);
    return ()=>media.removeEventListener("change",changed);
  },[]);
  const reducedMotion=useSyncExternalStore(subscribeMotion,motionSnapshot,serverMotionSnapshot);
  const asOfDate=curve.asOf.slice(0,10);
  const points=useMemo(()=>curve.points.filter(point=>/^\d{4}-\d{2}-\d{2}$/.test(point.date)&&Number.isFinite(dayTime(point.date))).map(point=>({
    ...point,planned:percentage(point.planned),actual:point.date<=asOfDate&&(point.actualSource==="live"||point.actualSource==="report"&&curve.historyAvailable)?percentage(point.actual):null,
  })).sort((a,b)=>a.date.localeCompare(b.date)),[curve.points,curve.historyAvailable,asOfDate]);
  const hasPoints=points.length>0;
  useEffect(()=>{
    const target=container.current;
    if(!target||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(entries=>{
      const measured=Math.floor(entries[0]?.contentRect.width??0);
      if(measured>0)setWidth(previous=>previous===measured?previous:measured);
    });
    observer.observe(target);return ()=>observer.disconnect();
  },[hasPoints]);

  if(!hasPoints)return <p className="px-4 py-8 text-sm text-[#526675] sm:px-5">The delivery curve is unavailable. Refresh progress to try again.</p>;
  const latestActual=points.findLastIndex(point=>point.actual!==null);
  const defaultIndex=latestActual<0?points.length-1:latestActual;
  const requested=selectedDate===null?-1:points.findIndex(point=>point.date===selectedDate);
  const index=requested<0?defaultIndex:requested,selected=points[index];
  const height=width<520?228:264,plotWidth=Math.max(1,width-LEFT-RIGHT),plotHeight=height-TOP-BOTTOM;
  const first=dayTime(points[0].date),last=dayTime(points[points.length-1].date),span=last-first;
  const x=(date:string)=>span?LEFT+(dayTime(date)-first)/span*plotWidth:LEFT+plotWidth/2;
  const y=(value:number)=>TOP+(1-value/100)*plotHeight;
  const planned=points.filter(point=>point.planned!==null),actual=points.filter(point=>point.actual!==null);
  const plannedPath=plannedStepPath(planned,x,y),actualPath=linePath(actual,"actual",x,y);
  const hasLine=planned.length>1||actual.length>1,animate=hasLine&&!animationFinished&&!reducedMotion;
  // Axis labels follow the continuous UTC date domain, not clustered report
  // indices. They do not add observations to the slider, paths or data table.
  const tickCount=span?Math.min(width<600?3:5,Math.floor(span/86_400_000)+1):1;
  const ticks=Array.from({length:tickCount},(_,tick)=>first+span*tick/Math.max(1,tickCount-1));
  const select=(next:number)=>setSelectedDate(points[Math.max(0,Math.min(points.length-1,next))].date);
  const selectAtPointer=(event:PointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    if(!rect.width||!Number.isFinite(event.clientX))return;
    const ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*width-LEFT)/plotWidth));
    const target=first+ratio*span;
    let nearest=0;
    for(let candidate=1;candidate<points.length;candidate++)if(Math.abs(dayTime(points[candidate].date)-target)<Math.abs(dayTime(points[nearest].date)-target))nearest=candidate;
    select(nearest);
  };
  const label=`${dateLabel(selected.date)}; planned ${selected.planned===null?"not available":percent(selected.planned)}; actual ${selected.actual===null?"not observed":percent(selected.actual)}`;
  return <div className="min-w-0 px-4 pb-4 sm:px-5 sm:pb-5">
    <div className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#526675]"><span className="inline-flex items-center gap-2"><span className={styles.actualKey} aria-hidden="true"/>Actual progress</span><span className="inline-flex items-center gap-2"><span className={styles.plannedKey} aria-hidden="true"/>Planned final issues</span></div>
      {hasLine&&<button type="button" data-preview-safe className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#0c5b45] disabled:text-[#526675] disabled:opacity-60" disabled={reducedMotion} aria-describedby={reducedMotion?`${id}-motion`:undefined} onClick={()=>{if(!motionSnapshot()){setAnimationFinished(false);setReplay(value=>value+1);}}}><RotateCcw size={14} aria-hidden="true"/>Replay animation</button>}
    </div>
    {reducedMotion&&hasLine&&<p id={`${id}-motion`} className="sr-only">Animation is off because reduced motion is requested or motion preferences are unavailable.</p>}
    <figure className="min-w-0">
      <p id={`${id}-description`} className="sr-only">Cumulative percentage progress against dates. Green solid actual progress connects saved report observations through the current live value; it never forecasts future actual progress. Navy dashed planned progress covers dated final issues only. Exact values are available using Explore curve dates or View curve data.</p>
      <div ref={container} role="img" aria-label="Project delivery S-curve" aria-describedby={`${id}-description`} className={styles.plot} style={{height}} onPointerDown={selectAtPointer}>
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
          <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} rx={8} fill="#f7faf9"/>
          {[0,25,50,75,100].map(value=><g key={value}><line x1={LEFT} x2={width-RIGHT} y1={y(value)} y2={y(value)} stroke="#e1e9e5"/><text x={LEFT-9} y={y(value)+4} textAnchor="end" fill="#526675" fontSize={11}>{value}%</text></g>)}
          {ticks.map((time,tick)=><text key={time} x={span?LEFT+(time-first)/span*plotWidth:LEFT+plotWidth/2} y={height-10} textAnchor={ticks.length===1?"middle":tick===0?"start":tick===ticks.length-1?"end":"middle"} fill="#526675" fontSize={11}>{dateLabel(new Date(time).toISOString().slice(0,10),true)}</text>)}
        </svg>
        <div key={replay} data-curve-traces data-animating={animate} className={`${styles.traceLayer} ${animate?styles.reveal:""}`} onAnimationEnd={()=>setAnimationFinished(true)}>
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
            <defs><linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0c5b45" stopOpacity=".12"/><stop offset="100%" stopColor="#0c5b45" stopOpacity=".01"/></linearGradient></defs>
            {actual.length>1&&<path d={`${actualPath} L ${x(actual.at(-1)!.date)} ${y(0)} L ${x(actual[0].date)} ${y(0)} Z`} fill={`url(#${id}-fill)`}/>}
            {planned.length>1&&<path data-curve-series="planned" d={plannedPath} fill="none" stroke="#24384f" strokeWidth={2.2} strokeDasharray="6 6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
            {actual.length>1&&<path data-curve-series="actual" d={actualPath} fill="none" stroke="#0c5b45" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>}
            {planned.length===1&&<circle data-curve-series="planned-point" cx={x(planned[0].date)} cy={y(planned[0].planned!)} r={4} fill="white" stroke="#24384f" strokeWidth={2}/>}
            {actual.filter(point=>actual.length<12||point.actualSource==="live").map(point=><circle key={point.date} data-curve-series="actual-point" data-source={point.actualSource} cx={x(point.date)} cy={y(point.actual!)} r={point.actualSource==="live"?5:3} fill={point.actualSource==="live"?"#0c5b45":"white"} stroke="#0c5b45" strokeWidth={2}/>)}
          </svg>
        </div>
        <svg className={styles.cursorLayer} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" preserveAspectRatio="none">
          <line x1={x(selected.date)} x2={x(selected.date)} y1={TOP} y2={TOP+plotHeight} stroke="#526675" strokeOpacity=".4" strokeDasharray="3 5"/>
          {selected.planned!==null&&<circle cx={x(selected.date)} cy={y(selected.planned)} r={4} fill="white" stroke="#24384f" strokeWidth={2}/>}
          {selected.actual!==null&&<circle cx={x(selected.date)} cy={y(selected.actual)} r={5} fill="white" stroke="#0c5b45" strokeWidth={2.5}/>}
        </svg>
      </div>
      <figcaption className="rounded-xl border border-[#e1e9e5] bg-[#f8faf9] px-3 py-3 sm:px-4">
        <div role="status" aria-live="polite" aria-atomic="true"><dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <SelectedDatum label="Selected date" value={dateLabel(selected.date)} date/>
          <SelectedDatum label={curve.plannedCoverage<100?"Planned · dated scope":"Planned"} value={selected.planned===null?"Not available":percent(selected.planned)}/>
          <SelectedDatum label={selected.actual===null?"Actual":selected.actualSource==="live"?"Actual · live MDR":"Actual · saved report"} value={selected.actual===null?"Not observed":percent(selected.actual)}/>
        </dl></div>
        {curve.variance!==null&&<p className={`mt-3 text-xs ${curve.variance<0?"text-[#9b2c24]":"text-[#0c5b45]"}`}>Current snapshot: {curve.variance===0?"on plan":`${Number.isInteger(Math.abs(curve.variance))?Math.abs(curve.variance):Math.abs(curve.variance).toFixed(1)} percentage points ${curve.variance<0?"behind":"ahead of"} plan`}.</p>}
      </figcaption>
    </figure>
    <div className="mt-3 min-w-0">
      <div className="flex items-center justify-between gap-2"><label htmlFor={`${id}-date`} className="text-xs font-semibold text-[#526675]">Explore curve dates</label><HelpTip label="Explore S-curve dates">Drag or tap the date slider, or use Arrow keys, Home and End. You can also tap a date on the chart. Actual values appear only for observed report dates and the live snapshot.</HelpTip></div>
      <div className="flex min-w-0 items-center gap-2"><button type="button" data-preview-safe aria-label="Previous curve date" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dde4eb] text-[#0c5b45] disabled:opacity-40" disabled={index===0} onClick={()=>select(index-1)}><ArrowLeft size={16} aria-hidden="true"/></button>
        <input id={`${id}-date`} data-preview-safe className={styles.range} type="range" min={0} max={points.length-1} step={1} value={index} disabled={points.length===1} aria-valuetext={label} onChange={event=>select(Number(event.currentTarget.value))} onKeyDown={event=>{const next=event.key==="Home"?0:event.key==="End"?points.length-1:event.key==="ArrowLeft"||event.key==="ArrowDown"?index-1:event.key==="ArrowRight"||event.key==="ArrowUp"?index+1:null;if(next!==null){event.preventDefault();select(next);}}}/>
        <button type="button" data-preview-safe aria-label="Next curve date" className="grid size-11 shrink-0 place-items-center rounded-lg border border-[#dde4eb] text-[#0c5b45] disabled:opacity-40" disabled={index===points.length-1} onClick={()=>select(index+1)}><ArrowRight size={16} aria-hidden="true"/></button>
      </div>
    </div>
    <div className="mt-2 space-y-1 text-xs leading-5 text-[#526675]">
      {curve.plannedCoverage<100&&<p>{curve.plannedCoverage===0?"Planned curve unavailable. Add final-issue dates for a planned comparison.":`Final-issue dates cover ${percent(curve.plannedCoverage)} of weighted scope; the planned line does not assume dates for the remainder.`} {curve.undatedCount>0?`${curve.undatedCount} deliverable${curve.undatedCount===1?" is":"s are"} undated.`:null}</p>}
      {!curve.historyAvailable?<p>Saved report history is unavailable. Current MDR progress is still shown.</p>:actual.length<2?<p>Historical trend will appear as project reports are saved.</p>:null}
      {curve.invalidHistoryCount>0&&<p>{curve.invalidHistoryCount} saved report {curve.invalidHistoryCount===1?"snapshot could":"snapshots could"} not be plotted.</p>}
    </div>
    <details className="mt-3 border-t border-[#e7ecef]"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-[#0c5b45]">View curve data</summary>
      <div role="region" aria-label="S-curve data — scroll horizontally for all columns" tabIndex={0} className="min-w-0 overflow-x-auto rounded-lg border border-[#e1e9e5]">
        <table className="w-full min-w-[540px] text-left text-xs"><caption className="sr-only">Project delivery S-curve data</caption><thead className="bg-[#f5f8f7] text-[#526675]"><tr>{["Date","Planned","Actual","Actual source"].map(column=><th key={column} scope="col" className="px-3 py-3 font-semibold">{column}</th>)}</tr></thead><tbody>{points.map(point=><tr key={point.date} className="border-t border-[#e7ecef]"><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium">{dateLabel(point.date)}</th><td className="px-3 py-3">{point.planned===null?"Not available":percent(point.planned)}</td><td className="px-3 py-3">{point.actual===null?"Not observed":percent(point.actual)}</td><td className="px-3 py-3">{point.actual===null?"—":point.actualSource==="live"?"Live MDR":"Saved report"}</td></tr>)}</tbody></table>
      </div>
    </details>
  </div>;
}

function SelectedDatum({label,value,date=false}:{label:string;value:string;date?:boolean}){return <div className={date?"col-span-2 min-w-0 sm:col-span-1":"min-w-0"}><dt className="text-xs leading-5 text-[#526675]">{label}</dt><dd className="mt-0.5 break-words text-sm font-semibold tabular-nums text-[#10243e]">{value}</dd></div>;}
function linePath(points:DeliveryCurvePoint[],field:"planned"|"actual",x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>`${index?"L":"M"} ${Number(x(point.date).toFixed(2))} ${Number(y(point[field]!).toFixed(2))}`).join(" ");}
function plannedStepPath(points:DeliveryCurvePoint[],x:(date:string)=>number,y:(value:number)=>number){return points.map((point,index)=>index?`H ${Number(x(point.date).toFixed(2))} V ${Number(y(point.planned!).toFixed(2))}`:`M ${Number(x(point.date).toFixed(2))} ${Number(y(point.planned!).toFixed(2))}`).join(" ");}
