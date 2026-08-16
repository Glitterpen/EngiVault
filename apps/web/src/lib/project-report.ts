import {z} from "zod";

export const REPORT_WEEKDAYS=[
  {value:0,label:"Sunday"},
  {value:1,label:"Monday"},
  {value:2,label:"Tuesday"},
  {value:3,label:"Wednesday"},
  {value:4,label:"Thursday"},
  {value:5,label:"Friday"},
  {value:6,label:"Saturday"},
] as const;

export const DISCIPLINE_REPORT_COLUMN_OPTIONS=[
  {value:"planned",label:"Total MDR deliverables"},
  {value:"submitted_to_date",label:"Stage-issued to date"},
  {value:"planned_this_week",label:"Planned this week"},
  {value:"issued_this_week",label:"Stage issues this week"},
  {value:"weekly_variance",label:"Weekly variance"},
  {value:"project_variance",label:"Terminal milestone variance"},
  {value:"planned_completion",label:"Planned completion"},
  {value:"actual_completion",label:"Stage-weighted actual"},
  {value:"issued_this_week_percent",label:"% issued this week"},
  {value:"weekly_variance_percent",label:"% weekly variance"},
  {value:"cumulative_variance_percent",label:"% cumulative variance"},
] as const;

export type DisciplineReportColumn=(typeof DISCIPLINE_REPORT_COLUMN_OPTIONS)[number]["value"];

export const DEFAULT_DISCIPLINE_REPORT_COLUMNS:DisciplineReportColumn[]=[
  "planned",
  "submitted_to_date",
  "planned_this_week",
  "issued_this_week",
  "weekly_variance",
  "project_variance",
  "planned_completion",
  "actual_completion",
];

const disciplineReportColumnSchema=z.enum(DISCIPLINE_REPORT_COLUMN_OPTIONS.map(option=>option.value) as [DisciplineReportColumn,...DisciplineReportColumn[]]);

const nullableText=z.string().nullable();
const nullableDate=z.iso.date().nullable();

const reportSummarySchema=z.object({
  planned_deliverables:z.number().int().nonnegative().optional(),
  completed_deliverables:z.number().int().nonnegative().optional(),
  overall_progress:z.number().int(),
  previous_progress:z.number().int().nullable(),
  progress_gain:z.number().int().nullable(),
  total_deliverables:z.number().int().nonnegative(),
  uploaded_deliverables:z.number().int().nonnegative(),
  approved_deliverables:z.number().int().nonnegative(),
  overdue_deliverables:z.number().int().nonnegative(),
  weekly_submissions:z.number().int().nonnegative(),
  weekly_acceptances:z.number().int().nonnegative(),
  weekly_due:z.number().int().nonnegative(),
}).transform(summary=>({
  ...summary,
  planned_deliverables:summary.planned_deliverables??summary.total_deliverables,
  completed_deliverables:summary.completed_deliverables??summary.approved_deliverables,
}));

const reportDisciplineSchema=z.object({
  discipline:z.string(),
  planned:z.number().int().nonnegative().optional(),
  completed:z.number().int().nonnegative().optional(),
  submitted_to_date:z.number().int().nonnegative().optional(),
  planned_this_week:z.number().int().nonnegative().optional(),
  issued_this_week:z.number().int().nonnegative().optional(),
  weekly_variance:z.number().int().optional(),
  project_variance:z.number().int().optional(),
  cumulative_planned:z.number().int().nonnegative().optional(),
  planned_completion:z.number().int().min(0).max(100).optional(),
  actual_completion:z.number().int().min(0).max(100).optional(),
  total:z.number().int().nonnegative(),
  uploaded:z.number().int().nonnegative(),
  approved:z.number().int().nonnegative(),
  overdue:z.number().int().nonnegative(),
  progress:z.number().int(),
  weekly_submissions:z.number().int().nonnegative(),
  weekly_acceptances:z.number().int().nonnegative(),
}).transform(discipline=>({
  ...discipline,
  planned:discipline.planned??discipline.total,
  completed:discipline.completed??discipline.approved,
  submitted_to_date:discipline.submitted_to_date??discipline.completed??discipline.approved,
  planned_this_week:discipline.planned_this_week??discipline.issued_this_week??discipline.weekly_acceptances,
  issued_this_week:discipline.issued_this_week??discipline.weekly_acceptances,
  weekly_variance:discipline.weekly_variance??0,
  project_variance:discipline.project_variance??0,
  cumulative_planned:discipline.cumulative_planned??Math.max(0,(discipline.submitted_to_date??discipline.completed??discipline.approved)-(discipline.project_variance??0)),
  planned_completion:discipline.planned_completion??discipline.actual_completion??discipline.progress,
  actual_completion:discipline.actual_completion??discipline.progress,
}));

const sCurveSchema=z.object({
  overall:z.array(z.object({
    date:z.iso.date(),
    planned:z.number().nonnegative(),
    completed:z.number().nonnegative().nullable(),
  })),
  disciplines:z.array(z.object({
    discipline:z.string(),
    planned:z.number().int().nonnegative(),
    completed:z.number().int().nonnegative(),
    variance:z.number().int(),
    completion_percent:z.number().int().min(0).max(100),
  })),
});

export const projectReportSnapshotSchema=z.object({
  identity:z.object({
    organisation_name:z.string(),
    project_code:z.string(),
    project_name:z.string(),
    client_name:nullableText,
    facility_location:nullableText,
    project_introduction:nullableText,
    key_objectives:z.array(z.string()),
    planned_start_date:nullableDate,
    planned_end_date:nullableDate,
    client_logo_count:z.number().int().min(0).max(3),
    delivery_stage:z.enum(["concept","feed","ded"]).optional().default("feed"),
    terminal_issue_status:z.string().optional().default("Issued for Design (IFD)"),
  }),
  summary:reportSummarySchema,
  disciplines:z.array(reportDisciplineSchema),
  discipline_columns:z.array(disciplineReportColumnSchema).min(1).max(11).optional().default([...DEFAULT_DISCIPLINE_REPORT_COLUMNS]),
  lookahead:z.array(z.object({
    document_number:z.string(),
    title:z.string(),
    discipline:z.string(),
    responsible_party:nullableText,
    planned_submission_date:z.iso.date(),
    required_issue_status:nullableText,
  })),
  weekly_issued_deliverables:z.array(z.object({
    document_number:z.string(),
    title:z.string(),
    discipline:z.string(),
    revision_code:z.string(),
    issue_status:z.string(),
    issued_at:z.iso.datetime({offset:true}),
  })).optional().default([]),
  challenges:z.array(z.object({
    title:z.string(),
    description:nullableText,
    severity:z.string(),
    status:z.string(),
    owner_name:nullableText,
    due_date:nullableDate,
  })),
  s_curve:sCurveSchema.optional().default({overall:[],disciplines:[]}),
});

export type ProjectReportSnapshot=z.infer<typeof projectReportSnapshotSchema>;

export function disciplineReportColumnLabel(column:DisciplineReportColumn){
  return DISCIPLINE_REPORT_COLUMN_OPTIONS.find(option=>option.value===column)?.label??column;
}

export function resolveDisciplineReportColumns(requested:string|string[]|undefined,fallback:DisciplineReportColumn[]){
  const values=Array.isArray(requested)?requested:requested?[requested]:[];
  const allowed=new Set<DisciplineReportColumn>(DISCIPLINE_REPORT_COLUMN_OPTIONS.map(option=>option.value));
  const selected=[...new Set(values.filter((value):value is DisciplineReportColumn=>allowed.has(value as DisciplineReportColumn)))].slice(0,DISCIPLINE_REPORT_COLUMN_OPTIONS.length);
  return selected.length?selected:fallback;
}

export function disciplineReportColumnsQuery(columns:DisciplineReportColumn[]){
  const query=new URLSearchParams();for(const column of columns)query.append("columns",column);return query.toString();
}

export function disciplineReportValue(row:ProjectReportSnapshot["disciplines"][number],column:DisciplineReportColumn){
  if(column==="issued_this_week_percent")return percentageRatio(row.issued_this_week,row.planned_this_week);
  if(column==="weekly_variance_percent")return percentageRatio(row.weekly_variance,row.planned_this_week,true);
  if(column==="cumulative_variance_percent")return percentageRatio(row.project_variance,row.cumulative_planned,true);
  if(column==="planned_completion")return `${row.planned_completion}%`;
  if(column==="actual_completion")return `${row.actual_completion}%`;
  return String(row[column]);
}

function percentageRatio(numerator:number,denominator:number,signed=false){
  if(denominator<=0)return "N/A";
  const value=Math.round(numerator/denominator*1000)/10;
  return `${signed&&value>0?"+":""}${Number.isInteger(value)?value:value.toFixed(1)}%`;
}

export function projectSCurveProgress(curve:ProjectReportSnapshot["s_curve"],totalDeliverables:number){
  const total=Math.max(1,totalDeliverables,...curve.overall.map(point=>point.planned));
  const percentage=(value:number)=>Math.min(100,Math.max(0,Math.round(value/total*1000)/10));
  const firstDate=curve.overall[0]?.date;
  const weeklyPoints=firstDate?curve.overall.filter(point=>isProjectSCurveWeeklyDate(point.date,firstDate)):[];
  return weeklyPoints.map(point=>({date:point.date,planned:percentage(point.planned),actual:point.completed===null?null:percentage(point.completed)}));
}

export function isProjectSCurveWeeklyDate(value:string,projectStart:string){
  const difference=new Date(`${value}T00:00:00Z`).getTime()-new Date(`${projectStart}T00:00:00Z`).getTime();
  return difference>=0&&difference%604800000===0;
}

export function projectSCurveCurrentWeekDate(dates:string[],reportPeriodEnd:string){
  if(!dates.length)return reportPeriodEnd;
  const reportTime=new Date(`${reportPeriodEnd}T00:00:00Z`).getTime();
  const weeklyDates=dates.filter(value=>isProjectSCurveWeeklyDate(value,dates[0])).filter(value=>new Date(`${value}T00:00:00Z`).getTime()<=reportTime);
  return weeklyDates.at(-1)??dates[0];
}

export function reportWeekdayLabel(value:number){
  return REPORT_WEEKDAYS.find(day=>day.value===value)?.label??"Not scheduled";
}

export function projectReportNumber(value:number){
  return `PCR-${String(value).padStart(4,"0")}`;
}

export function progressMovement(value:number|null){
  if(value===null)return "Baseline";
  return `${value>0?"+":""}${value}%`;
}

export function reportDateInTimezone(value=new Date(),timeZone="Africa/Lagos"){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value);
  const part=(type:Intl.DateTimeFormatPartTypes)=>parts.find(item=>item.type===type)?.value??"";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
