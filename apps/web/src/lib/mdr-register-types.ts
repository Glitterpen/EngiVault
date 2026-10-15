import type {DocumentSchedule} from "@/lib/document-schedule";

export type MdrFilters={q?:string;page?:string;discipline?:string;documentType?:string;status?:string;area?:string;view?:string;records?:string};
export type MdrRevision={state:string;id?:string;revision_code?:string|null;issue_status?:string|null;created_at?:string|null;control_status?:string|null};
export type MdrDocument={schedule:DocumentSchedule;id:string;document_number:string;title:string;document_type:string;discipline:string;status:string;area:string|null;system:string|null;work_package:string|null;planned_submission_date:string|null;updated_at:string;lifecycle_status:string;document_revisions:MdrRevision[]};
export type MdrDisciplineSummary={name:string;count:number};
export type MdrFolderPage={documents:MdrDocument[];total:number;page:number;pageSize:number;canManage:boolean};
