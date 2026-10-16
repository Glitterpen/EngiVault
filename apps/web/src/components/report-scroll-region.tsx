import type {ReactNode} from "react";
import styles from "@/components/project-report-presentation.module.css";
import {TableScrollRegion} from "@/components/table-scroll-region";

/** Native horizontal scrolling remains reachable by keyboard without changing report data. */
export function ReportScrollRegion({label,children,className=""}:{label:string;children:ReactNode;className?:string}){
  return <TableScrollRegion label={`${label} — scroll horizontally`} previewSafe className={`${styles.scrollRegion} ${className}`}>{children}</TableScrollRegion>;
}
