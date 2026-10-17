import {z} from "zod";

export const PDF_COLOR_TEMPLATE_IDS=["neutral","slate","forest","burgundy","monochrome"] as const;
export type PdfColorTemplate=typeof PDF_COLOR_TEMPLATE_IDS[number];
type Rgb=readonly [number,number,number];
export type PdfPalette={header:Rgb;accent:Rgb;planned:Rgb;paper:Rgb;line:Rgb;ink:Rgb;muted:Rgb;white:Rgb};

const common={ink:[48,54,59] as const,muted:[98,107,112] as const,white:[255,255,255] as const};
export const PDF_COLOR_TEMPLATES:ReadonlyArray<{id:PdfColorTemplate;label:string;palette:PdfPalette}>=[
  {id:"neutral",label:"Neutral",palette:{...common,header:[53,61,67],accent:[66,106,103],planned:[139,120,102],paper:[241,243,243],line:[201,206,206]}},
  {id:"slate",label:"Slate Blue",palette:{...common,header:[47,62,79],accent:[64,91,122],planned:[139,120,102],paper:[240,243,247],line:[199,207,217]}},
  {id:"forest",label:"Forest",palette:{...common,header:[44,62,54],accent:[55,102,80],planned:[139,120,102],paper:[240,245,242],line:[198,211,203]}},
  {id:"burgundy",label:"Burgundy",palette:{...common,header:[79,48,59],accent:[122,62,83],planned:[121,125,132],paper:[247,241,243],line:[217,201,207]}},
  {id:"monochrome",label:"Monochrome",palette:{...common,header:[50,50,50],accent:[95,95,95],planned:[140,140,140],paper:[243,243,243],line:[205,205,205]}},
];

/** Unrecognised historical metadata remains readable with the neutral presentation. */
export function pdfColorTemplate(value:unknown){
  return PDF_COLOR_TEMPLATES.find(template=>template.id===value)??PDF_COLOR_TEMPLATES[0];
}

/** A submitted, unsupported value must be rejected rather than silently changed. */
export const pdfColorTemplateField=z.enum(PDF_COLOR_TEMPLATE_IDS).default("neutral");
