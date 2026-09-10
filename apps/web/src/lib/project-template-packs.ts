import {z} from "zod";

export const TEMPLATE_PACK_MAX_BYTES=50*1024*1024;
export const templateScope=z.object({organisationId:z.uuid(),projectId:z.uuid()});
export const templateUpload=z.object({
  filename:z.string().min(5).max(180).regex(/^[^/\\\x00-\x1f]+\.zip$/i),
  size:z.number().int().min(1).max(TEMPLATE_PACK_MAX_BYTES),
  sha256:z.string().regex(/^[a-f0-9]{64}$/),
});
export type TemplatePackStatus={
  current:{id:string;filename:string;byteSize:number;fileCount:number;publishedAt:string}|null;
  pending:{id:string;filename:string}|null;
};
export function templateFailure(status:number,message:string){
  return Response.json({error:{message}},{status,headers:{"Cache-Control":"private, no-store"}});
}
