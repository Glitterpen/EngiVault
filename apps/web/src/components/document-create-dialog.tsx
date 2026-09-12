"use client";
import {FilePlus2} from "lucide-react";
import {DocumentCreateForm} from "@/components/document-create-form";
import {AppDialog} from "@/components/app-dialog";
type Category={code:string;name:string};
export function DocumentCreateDialog({organisationId,projectId,disciplines,documentTypes}:{organisationId:string;projectId:string;disciplines:Category[];documentTypes:Category[]}) {
 return <AppDialog primary title="Register a document" trigger={<><FilePlus2 size={16}/> Register document</>}><DocumentCreateForm organisationId={organisationId} projectId={projectId} disciplines={disciplines} documentTypes={documentTypes} bare/></AppDialog>;
}
