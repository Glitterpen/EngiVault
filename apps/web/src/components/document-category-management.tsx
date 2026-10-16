"use client";

import {useId} from "react";
import {useFormStatus} from "react-dom";
import {toggleDocumentCategory} from "@/app/app/actions";

export type DocumentCategory={id:string;kind:string;code:string;name:string;is_active:boolean};

export function DocumentCategoryManagement({organisationId,categories}:{organisationId:string;categories:DocumentCategory[]}){
  const id=useId();
  return <section aria-labelledby={`${id}-title`} className="ev-card min-w-0">
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#d6e0ed] px-4 py-4 sm:px-5">
      <h2 id={`${id}-title`} className="text-base font-semibold text-[#10243e]">Registered categories</h2>
      <p className="text-xs text-[#526675]">{categories.length} {categories.length===1?"category":"categories"}</p>
    </header>
    {categories.length?<ul className="min-w-0 divide-y divide-[#d6e0ed]">
      {categories.map(category=><li key={category.id} className="min-w-0 p-4 sm:p-5">
        <article aria-labelledby={`${id}-${category.id}`} className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <h3 id={`${id}-${category.id}`} className="text-sm font-semibold leading-6 text-[#10243e] [overflow-wrap:anywhere]">{category.name}</h3>
            <dl className="mt-3 grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
              <div className="min-w-0"><dt className="text-xs text-[#526675]">Kind</dt><dd className="mt-1 text-sm capitalize text-[#24384f] [overflow-wrap:anywhere]">{category.kind.replaceAll("_"," ")}</dd></div>
              <div className="min-w-0"><dt className="text-xs text-[#526675]">Short code</dt><dd className="mt-1 font-mono text-sm text-[#24384f] [overflow-wrap:anywhere]">{category.code}</dd></div>
              <div className="col-span-2 min-w-0 lg:col-span-1"><dt className="text-xs text-[#526675]">Status</dt><dd className={`mt-1 inline-flex max-w-full rounded-md px-2 py-1 text-xs font-medium ${category.is_active?"bg-[#eef3fa] text-[#24384f]":"bg-[#f0f3f6] text-[#526675]"}`}>{category.is_active?"Active":"Inactive"}</dd></div>
            </dl>
          </div>
          <form action={toggleDocumentCategory} aria-label={`Change ${category.name} availability`} className="min-w-0 self-start sm:self-center">
            <input type="hidden" name="organisationId" value={organisationId}/>
            <input type="hidden" name="categoryId" value={category.id}/>
            <input type="hidden" name="isActive" value={String(!category.is_active)}/>
            <CategoryToggle category={category}/>
          </form>
        </article>
      </li>)}
    </ul>:<p className="p-5 text-sm leading-6 text-[#526675]">No document categories are registered yet.</p>}
  </section>;
}

function CategoryToggle({category}:{category:DocumentCategory}){
  const {pending}=useFormStatus();
  const label=`${category.is_active?"Disable":"Enable"} ${category.name} ${category.kind.replaceAll("_"," ")}`;
  return <><button type="submit" disabled={pending} aria-busy={pending} aria-label={pending?`Updating ${category.name}`:label} className="ev-button-secondary min-h-11 w-full min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#10243e] sm:w-auto">{pending?"Updating…":category.is_active?"Disable":"Enable"}</button><span role="status" aria-live="polite" className="sr-only">{pending?`Updating ${category.name} availability…`:""}</span></>;
}
