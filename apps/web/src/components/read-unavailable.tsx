import type {ReactNode} from "react";

/** A failed read is not an empty result. Retry navigation never starts processing. */
export function ReadUnavailable({title,href,children}:{title:string;href:string;children?:ReactNode}){
  return <section role="alert" className="ev-card mx-auto max-w-2xl p-5 sm:p-7">
    <h1 className="text-xl font-semibold text-[#10243e]">{title}</h1>
    <p className="mt-3 text-sm leading-6 text-[#526675]">{children??"This information could not be loaded. Please try again shortly."}</p>
    <a href={href} data-preview-safe className="ev-button-secondary mt-4">Retry loading</a>
  </section>;
}
