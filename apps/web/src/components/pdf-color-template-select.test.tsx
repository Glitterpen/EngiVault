import {afterEach,describe,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {PdfColorTemplateSelect} from "./pdf-color-template-select";
import {renderToString} from "react-dom/server";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {createRequire} from "node:module";

afterEach(cleanup);
describe("PDF colour-template selection",()=>{
  it("can export an actual-selector, actual-styles visual QA fixture when requested",async()=>{
    const output=process.env.PDF_TEMPLATE_UI_PREVIEW_DIR;if(!output)return;
    const require=createRequire(import.meta.url),pluginPath=require.resolve("@tailwindcss/postcss");
    const postcss=require(require.resolve("postcss",{paths:[dirname(pluginPath)]}));
    const cssPath=resolve(process.cwd(),"src/app/globals.css");
    const compiled=await postcss([require(pluginPath)({base:process.cwd()})]).process(await readFile(cssPath,"utf8"),{from:cssPath});
    const html=renderToString(<main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8">
      <h1 className="text-xl font-semibold">PDF template selectors — synthetic visual preview</h1>
      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <section className="ev-card min-w-0 p-4 sm:p-6"><h2 className="mb-4 font-semibold">Weekly report schedule</h2><PdfColorTemplateSelect defaultValue="forest" label="Scheduled report colour template" description="Used for new scheduled reports. Previously captured reports keep their saved template."/></section>
        <section className="ev-card min-w-0 bg-[linear-gradient(145deg,#10243e,#173a58)] p-4 text-white sm:p-6"><h2 className="mb-4 font-semibold">Generate the current report</h2><PdfColorTemplateSelect defaultValue="slate" label="Report colour template" description="Used for a new report. Regenerating an existing reporting period keeps its original template."/></section>
      </div>
      <section className="ev-card min-w-0 p-4 sm:p-6"><h2 className="mb-4 font-semibold">Transmission details</h2><div className="max-w-xl"><PdfColorTemplateSelect defaultValue="burgundy" description="Frozen into this new transmittal. Previously issued PDFs and packages are not changed."/></div></section>
      <section className="ev-card min-w-0 p-4 sm:p-6"><h2 className="mb-4 font-semibold">Read-only audited preview</h2><div className="max-w-xl"><PdfColorTemplateSelect disabled/></div></section>
    </main>);
    await mkdir(output,{recursive:true});await writeFile(resolve(output,"index.html"),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF template controls preview</title><style>${compiled.css}</style></head><body>${html}</body></html>`);
    expect(compiled.css).toContain(".ev-input");
  },30000);
  it("defaults to neutral and exposes a keyboard-native labelled chooser with textual choices",()=>{
    const {container}=render(<form><PdfColorTemplateSelect/></form>);
    const select=screen.getByRole("combobox",{name:"PDF colour template"}) as HTMLSelectElement;
    expect(select.value).toBe("neutral");
    expect(screen.getAllByRole("option").map(option=>option.textContent)).toEqual(["Neutral","Slate Blue","Forest","Burgundy","Monochrome"]);
    expect(select.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.change(select,{target:{value:"slate"}});
    expect(new FormData(container.querySelector("form")!).get("pdfColorTemplate")).toBe("slate");
    expect(screen.getByText(/Existing issued documents keep their saved template/)).toBeTruthy();
  });
  it("uses the saved default, isolates separate selectors and supports read-only and pending states",()=>{
    render(<><PdfColorTemplateSelect defaultValue="burgundy" label="First"/><PdfColorTemplateSelect label="Second" disabled/></>);
    const first=screen.getByRole("combobox",{name:"First"}) as HTMLSelectElement;
    const second=screen.getByRole("combobox",{name:"Second"}) as HTMLSelectElement;
    expect(first.value).toBe("burgundy");expect(second.value).toBe("neutral");expect(second.disabled).toBe(true);
    fireEvent.change(first,{target:{value:"forest"}});
    expect(second.value).toBe("neutral");expect(first.id).not.toBe(second.id);
  });
});
