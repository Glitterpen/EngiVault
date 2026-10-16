import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {OrganisationCreateForm} from "./organisation-create-form";
import {OrganisationLogoRequired} from "./organisation-logo-required";
import {OrganisationAdminForm,ProjectAdminForm} from "./record-admin-forms";

const mocks=vi.hoisted(()=>({pending:false,action:vi.fn(),refresh:vi.fn()}));
vi.mock("react",async load=>({...await load<typeof import("react")>(),useActionState:()=>[undefined,mocks.action,mocks.pending]}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("@/app/app/actions",()=>({createOrganisation:vi.fn(),updateOrganisation:vi.fn(),updateProject:vi.fn(),updateDocument:vi.fn(),deleteOrganisation:vi.fn(),setDocumentArchived:vi.fn(),setOrganisationArchived:vi.fn(),setProjectArchived:vi.fn()}));

const organisation={id:"organisation-A",name:"Example Engineering",slug:"example",status:"active",logoUrl:null};
const project={id:"project-A",organisation_id:"organisation-A",code:"EX-001",name:"Example Project",description:null,status:"active",client_name:"Client",facility_location:null,client_logo_paths:[]};
const formats="image/png,image/jpeg,image/webp";

beforeEach(()=>{
  mocks.pending=false;mocks.action.mockReset();mocks.refresh.mockReset();
  vi.stubGlobal("URL",Object.assign(class extends URL {},{createObjectURL:vi.fn(()=>"blob:synthetic-logo"),revokeObjectURL:vi.fn()}));
});
afterEach(()=>{expect(mocks.action).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();});

describe("keyboard-accessible logo pickers",()=>{
  it.each([
    ["organisation creation",()=> <OrganisationCreateForm/>,"Company logo",true,false,"logo"],
    ["required company identity",()=> <OrganisationLogoRequired organisation={organisation}/>,"Company logo",true,false,"logo"],
    ["company identity settings",()=> <OrganisationAdminForm record={organisation}/>,"Replace company logo",false,false,"logo"],
    ["client identity settings",()=> <ProjectAdminForm record={project}/>,"Replace client logos",false,true,"clientLogos"],
  ] as const)("keeps %s picker focusable with a named, described native input",(_name,fixture,label,required,multiple,field)=>{
    render(fixture());
    const input=screen.getByLabelText(label,{exact:true}) as HTMLInputElement;
    expect(input.type).toBe("file");expect(input.name).toBe(field);expect(input.accept).toBe(formats);
    expect(input.required).toBe(required);expect(input.multiple).toBe(multiple);expect(input.disabled).toBe(false);
    expect(input.tabIndex).toBe(0);expect(input.closest(".ev-file-picker")).not.toBeNull();
    const help=document.getElementById(input.getAttribute("aria-describedby")!);
    expect(help?.textContent).toContain("2 MB");expect(help?.textContent).toContain("PNG, JPEG or WebP");
    expect(input.closest("form")?.querySelector('button[type="submit"],button.ev-button')).not.toBeNull();
  });

  it.each([
    [()=> <OrganisationCreateForm/>],
    [()=> <OrganisationLogoRequired organisation={organisation}/>],
  ] as const)("announces the selected filename without hiding format guidance",fixture=>{
    render(fixture());
    const file=new File(["synthetic"],"approved-company-logo.png",{type:"image/png"});
    fireEvent.change(screen.getByLabelText("Company logo",{exact:true}),{target:{files:[file]}});
    expect(screen.getByText(file.name).getAttribute("aria-live")).toBe("polite");
    expect(screen.getByText(/PNG, JPEG or WebP/).textContent).toContain("2 MB");
  });

  it("keeps required identity submission blocked until a file is selected and while saving",()=>{
    const result=render(<OrganisationLogoRequired organisation={organisation}/>);
    expect((screen.getByRole("button",{name:"Use logo as organisation icon"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Company logo",{exact:true}),{target:{files:[new File(["synthetic"],"logo.png",{type:"image/png"})]}});
    expect((screen.getByRole("button",{name:"Use logo as organisation icon"}) as HTMLButtonElement).disabled).toBe(false);
    mocks.pending=true;result.rerender(<OrganisationLogoRequired organisation={organisation}/>);
    expect((screen.getByRole("button",{name:"Applying company identity…"}) as HTMLButtonElement).disabled).toBe(true);
  });

  it("preserves the existing three-client-logo limit",()=>{
    render(<ProjectAdminForm record={project}/>);
    fireEvent.change(screen.getByLabelText("Replace client logos"),{target:{files:Array.from({length:4},(_,i)=>new File(["synthetic"],`logo-${i}.png`,{type:"image/png"}))}});
    expect(screen.getByRole("alert").textContent).toBe("Choose no more than three client logos.");
    expect((screen.getByRole("button",{name:"Save project identity"}) as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses distinct description IDs for multiple mounted forms",()=>{
    render(<><OrganisationCreateForm/><OrganisationLogoRequired organisation={organisation}/><OrganisationAdminForm record={organisation}/><ProjectAdminForm record={project}/></>);
    const inputs=Array.from(document.querySelectorAll('input[type="file"]'));
    const ids=inputs.map(input=>input.getAttribute("aria-describedby"));
    expect(new Set(ids).size).toBe(4);expect(ids.every(id=>id&&document.getElementById(id))).toBe(true);
  });
});
