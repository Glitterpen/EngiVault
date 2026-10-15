export type DeliveryCurveDocument={document_id:string;progress_weight:number;progress_credit:number;planned_final_date?:string|null;planned_submission_date?:string|null;revision_cycle_days?:number|null};
export type DeliveryCurveSubmissionProgress={version:1;captured_at:string;submitted_progress:number;accepted_progress:number;total_deliverables:number;total_weight:number};
export type DeliveryCurveReport={id:string;period_end:string;generated_at:string;snapshot:unknown};
export type DeliveryCurvePoint={date:string;submitted:number|null;accepted:number|null;submittedSource:"report"|"live"|null;acceptedSource:"report"|"live"|null};
export type DeliveryCurveModel={
  points:DeliveryCurvePoint[];
  asOf:string;
  submittedToday:number|null;
  acceptedToday:number;
  gap:number|null;
  hasScope:boolean;
  historyAvailable:boolean;
  submittedHistoryCount:number;
  acceptedHistoryCount:number;
  invalidHistoryCount:number;
  timeline:{plannedStart:string|null;plannedEnd:string|null;status:"configured"|"missing"|"invalid";displayStart:string;displayEnd:string};
};

type Input={documents:readonly DeliveryCurveDocument[];submissionProgress:DeliveryCurveSubmissionProgress|null;reports:readonly DeliveryCurveReport[];asOf:string;plannedStart:string|null;plannedEnd:string|null;historyAvailable:boolean};
type Observation={date:string;generatedAt:number;id:string;submitted:number|null;accepted:number|null};
const MAX_POINTS=300;
const ACCEPTED_TOLERANCE=0.15;

function dateTime(value:string):number|null{
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1])return null;
  const timestamp=Date.parse(value+"T00:00:00Z");
  return Number.isFinite(timestamp)?timestamp:null;
}
function timestampTime(value:unknown):number|null{
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||dateTime(value.slice(0,10))===null)return null;
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?timestamp:null;
}
function finiteNumber(value:unknown):number|null{
  if(typeof value!=="number"&&(typeof value!=="string"||!value.trim()))return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function bounded(value:unknown,maximum:number):number{return Math.min(maximum,Math.max(0,finiteNumber(value)??0));}
function percentage(value:unknown):number|null{
  const number=finiteNumber(value);
  return number!==null&&number>=0&&number<=100?number:null;
}
function object(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function evenly<T>(items:readonly T[],limit:number):T[]{
  if(limit<=0)return [];
  if(items.length<=limit)return [...items];
  if(limit===1)return [items[items.length-1]];
  return Array.from({length:limit},(_,index)=>items[Math.round(index*(items.length-1)/(limit-1))]);
}

/** The management RPC supplies only an aggregate, so never infer missing submitted credit. */
function liveSubmittedProgress(value:DeliveryCurveSubmissionProgress|null,now:number,today:string,documentCount:number,totalWeight:number,acceptedPercentage:number):number|null{
  if(!object(value)||value.version!==1)return null;
  const capturedAt=timestampTime(value.captured_at);
  const submitted=percentage(value.submitted_progress),accepted=percentage(value.accepted_progress);
  const count=finiteNumber(value.total_deliverables),weight=finiteNumber(value.total_weight);
  if(capturedAt===null||capturedAt>now||new Date(capturedAt).toISOString().slice(0,10)!==today
    ||submitted===null||accepted===null||accepted>submitted||count!==documentCount
    ||weight===null||weight<0||Math.abs(weight-totalWeight)>Math.max(1e-6,Math.abs(totalWeight)*1e-9)
    ||Math.abs(accepted-acceptedPercentage)>ACCEPTED_TOLERANCE+Number.EPSILON
    ||submitted+ACCEPTED_TOLERANCE<acceptedPercentage)return null;
  if(totalWeight===0&&(submitted!==0||accepted!==0))return null;
  // A decimal-rounded aggregate must not display below its already accepted floor.
  return Math.max(Math.round(acceptedPercentage),Math.round(submitted));
}

/** Legacy saved progress is accepted-only; submitted history requires real capture metadata. */
function reportObservation(snapshot:unknown,cutoff:string,now:number){
  const summary=object(snapshot)&&object(snapshot.summary)?snapshot.summary:null;
  const legacyAccepted=summary?percentage(summary.overall_progress):null;
  const comparison=object(snapshot)?snapshot.delivery_progress_comparison:undefined;
  if(comparison===undefined)return {submitted:null,accepted:legacyAccepted,invalid:legacyAccepted===null};
  if(!object(comparison))return {submitted:null,accepted:legacyAccepted,invalid:true};
  const capturedAt=timestampTime(comparison.captured_at);
  const submitted=percentage(comparison.submitted_progress);
  const count=finiteNumber(comparison.total_deliverables),weight=finiteNumber(comparison.total_weight);
  const accepted=percentage(comparison.accepted_progress);
  const valid=comparison.version===1&&capturedAt!==null&&capturedAt<=now&&new Date(capturedAt).toISOString().slice(0,10)===cutoff
    &&submitted!==null&&count!==null&&Number.isSafeInteger(count)&&count>=0&&weight!==null&&weight>=0
    &&(count===0?weight===0:weight>0)&&accepted!==null&&accepted<=submitted
    &&(weight!==0||(submitted===0&&accepted===0));
  return valid?{submitted,accepted,invalid:false}:{submitted:null,accepted:legacyAccepted,invalid:true};
}

/** Observed submitted and DCC-accepted progress; project dates set the timeline only. */
export function buildProjectDeliveryCurve({documents,submissionProgress,reports,asOf,plannedStart,plannedEnd,historyAvailable}:Input):DeliveryCurveModel{
  const now=timestampTime(asOf);
  if(now===null)throw new Error("A valid as-of timestamp is required for the delivery curve.");
  const normalizedAsOf=new Date(now).toISOString(),today=normalizedAsOf.slice(0,10);
  let totalWeight=0,acceptedWeight=0;
  for(const document of documents){
    const weight=bounded(document.progress_weight,Number.MAX_SAFE_INTEGER),accepted=bounded(document.progress_credit,100);
    totalWeight+=weight;acceptedWeight+=weight*accepted/100;
  }
  const acceptedPercentage=totalWeight?Math.min(100,Math.max(0,acceptedWeight/totalWeight*100)):0;
  const acceptedToday=Math.round(acceptedPercentage);
  const submittedToday=liveSubmittedProgress(submissionProgress,now,today,documents.length,totalWeight,acceptedPercentage);

  const start=typeof plannedStart==="string"&&plannedStart.trim()?plannedStart:null;
  const end=typeof plannedEnd==="string"&&plannedEnd.trim()?plannedEnd:null;
  const startValid=start!==null&&dateTime(start)!==null,endValid=end!==null&&dateTime(end)!==null;
  const configured=startValid&&endValid&&start!==null&&end!==null&&start<=end;
  const status:DeliveryCurveModel["timeline"]["status"]=(start!==null&&!startValid)||(end!==null&&!endValid)||(startValid&&endValid&&!configured)?"invalid":configured?"configured":"missing";
  let displayStart=configured&&start<today?start:today;
  const displayEnd=configured&&end>today?end:today;
  let invalidHistoryCount=0;
  const observations=new Map<string,Observation>();
  if(historyAvailable){
    for(const report of reports){
      const cutoff=typeof report.period_end==="string"?dateTime(report.period_end):null;
      if(cutoff===null){invalidHistoryCount++;continue;}
      if(report.period_end>=today||(status==="configured"&&(report.period_end<displayStart||report.period_end>displayEnd)))continue;
      const generatedAt=timestampTime(report.generated_at);
      if(generatedAt===null){invalidHistoryCount++;continue;}
      if(generatedAt>now)continue;
      const values=reportObservation(report.snapshot,report.period_end,now);
      if(values.invalid)invalidHistoryCount++;
      if(values.submitted===null&&values.accepted===null)continue;
      const prior=observations.get(report.period_end),id=typeof report.id==="string"?report.id:"";
      if(!prior||generatedAt>prior.generatedAt||generatedAt===prior.generatedAt&&id>prior.id){
        observations.set(report.period_end,{date:report.period_end,generatedAt,id,submitted:values.submitted,accepted:values.accepted});
      }
    }
  }
  if(status!=="configured"){
    for(const date of observations.keys())if(date<displayStart)displayStart=date;
  }
  const dates=new Set<string>([today]);
  if(status==="configured"){dates.add(start!);dates.add(end!);}
  const history=evenly([...observations.values()].sort((a,b)=>a.date.localeCompare(b.date)),MAX_POINTS-dates.size);
  const retained=new Map(history.map(point=>[point.date,point]));
  for(const point of history)dates.add(point.date);
  const points=[...dates].sort().map(date=>{
    const historic=retained.get(date),live=date===today;
    const submitted=live?submittedToday:historic?.submitted??null;
    const accepted=live?acceptedToday:historic?.accepted??null;
    return {date,submitted,accepted,submittedSource:submitted===null?null:live?"live":"report",acceptedSource:accepted===null?null:live?"live":"report"} satisfies DeliveryCurvePoint;
  });
  return {
    points,asOf:normalizedAsOf,submittedToday,acceptedToday,gap:submittedToday===null?null:submittedToday-acceptedToday,
    hasScope:documents.length>0,historyAvailable,
    submittedHistoryCount:history.filter(point=>point.submitted!==null).length,
    acceptedHistoryCount:history.filter(point=>point.accepted!==null).length,
    invalidHistoryCount,
    timeline:{plannedStart:start,plannedEnd:end,status,displayStart,displayEnd},
  };
}
