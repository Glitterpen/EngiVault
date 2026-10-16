import type {ReactNode} from "react";
import {PageState} from "@/components/page-state";

/** A failed read is not an empty result. Retry navigation never starts processing. */
export function ReadUnavailable({title,href,children}:{title:string;href:string;children?:ReactNode}){
  return <PageState kind="error" title={title} headingLevel={1} className="ev-card mx-auto max-w-2xl"
    actions={<a href={href} data-preview-safe className="ev-button-secondary">Retry loading</a>}>
    {children??"This information could not be loaded. Please try again shortly."}
  </PageState>;
}
