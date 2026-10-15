"use client";

import type {ReactNode} from "react";
import {UserCheck} from "lucide-react";
import {AppDialog} from "@/components/app-dialog";

export function MdrAssignmentDialog({children}:{children:ReactNode}){
  return <AppDialog title="Assign Deliverables" previewSafe trigger={<><UserCheck size={16} aria-hidden="true"/>Assign Deliverables</>}>{children}</AppDialog>;
}
