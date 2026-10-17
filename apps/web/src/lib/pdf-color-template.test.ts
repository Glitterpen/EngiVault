import {describe,expect,it} from "vitest";
import {PDF_COLOR_TEMPLATES,pdfColorTemplate,pdfColorTemplateField} from "./pdf-color-template";
import {projectReportSnapshotSchema} from "./project-report";

describe("PDF colour templates",()=>{
  it("offers five named professional palettes with readable body text",()=>{
    expect(PDF_COLOR_TEMPLATES.map(template=>template.id)).toEqual(["neutral","slate","forest","burgundy","monochrome"]);
    for(const template of PDF_COLOR_TEMPLATES){
      expect(template.label.length).toBeGreaterThan(3);
      expect(template.palette.ink).toEqual([48,54,59]);
      expect(template.palette.white).toEqual([255,255,255]);
      expect(pdfColorTemplateField.parse(template.id)).toBe(template.id);
    }
  });
  it.each([undefined,null,"legacy",true,{},["slate"],"SLATE"])("renders unknown saved metadata as neutral without rewriting it (%s)",value=>{
    expect(pdfColorTemplate(value).id).toBe("neutral");
    expect(projectReportSnapshotSchema.shape.pdf_color_template.parse(value)).toEqual(value);
  });
  it("defaults missing form values but rejects unsupported submitted values",()=>{
    expect(pdfColorTemplateField.parse(undefined)).toBe("neutral");
    for(const value of [null,"","blue","#ff0000","SLATE",{},["slate"]])expect(pdfColorTemplateField.safeParse(value).success).toBe(false);
  });
});
