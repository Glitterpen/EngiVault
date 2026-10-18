import {z} from "zod";

export const interdisciplinaryQuestionSchema=z.object({
  question:z.string().trim().min(2).max(1000),
  discipline:z.string().trim().max(200).default(""),
  stage:z.enum(["","IFR","IFA","IFD","IFC"]).default(""),
  mode:z.enum(["answer","search"]).default("answer"),
  requestId:z.uuid().optional(),
});

export type InterdisciplinaryEvidence={
  chunk_id:string;document_id:string;revision_id:string;document_number:string;title:string;
  revision_code:string;issue_status:string;submitted_at:string|null;locator_type:string;
  page_number:number|null;sheet_name:string|null;cell_range:string|null;content:string;score:number;
};
export type InterdisciplinarySource={
  label:number;documentId:string;revisionId:string;documentNumber:string;title:string;
  revision:string;issueStatus:string;submittedAt:string|null;page:number|null;
  sheet:string|null;cellRange:string|null;excerpt:string;
};
export type InterdisciplinaryAnswer={
  mode:"answer"|"search";question:string;answer:string;grounded:boolean;sources:InterdisciplinarySource[];
};

export function referenceLocation(source:{page:number|null;sheet:string|null;cellRange:string|null}){
  if(source.page)return `Page ${source.page}`;
  return [source.sheet,source.cellRange].filter(Boolean).join(" · ")||"Document excerpt";
}

export function evidenceSource(source:InterdisciplinaryEvidence,label:number):InterdisciplinarySource{
  return {label,documentId:source.document_id,revisionId:source.revision_id,documentNumber:source.document_number,
    title:source.title,revision:source.revision_code,issueStatus:source.issue_status,submittedAt:source.submitted_at,
    page:source.page_number,sheet:source.sheet_name,cellRange:source.cell_range,excerpt:source.content.slice(0,700)};
}
