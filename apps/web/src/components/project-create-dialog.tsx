"use client";

import {Plus} from "lucide-react";
import {AppDialog} from "@/components/app-dialog";
import {ProjectCreateForm} from "@/components/project-create-form";

export function ProjectCreateDialog({organisationId}:{organisationId:string}){
  return <AppDialog primary title="Create project" trigger={<><Plus size={16} aria-hidden="true"/>New project</>}><ProjectCreateForm organisationId={organisationId} embedded/></AppDialog>;
}
