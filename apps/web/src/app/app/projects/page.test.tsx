import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import AllProjectsPage from "./page";
import {requireUser} from "@/lib/auth";

vi.mock("@/lib/auth",()=>({requireUser:vi.fn()}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name}:{name:string})=><span role="img" aria-label={`${name} client logo`}/>}));

type Project={organisation_id:string;project_id:string;code:string;name:string;role:string};
const project=(id:string,role="engineer",organisation="org-a"):Project=>({organisation_id:organisation,project_id:id,code:`P-${id}`,name:`Project ${id}`,role});
let projects:Project[]|null,error:{code:string}|null;
const order=vi.fn(),select=vi.fn(),from=vi.fn(),rpc=vi.fn();

beforeEach(()=>{
  vi.clearAllMocks();
  projects=[project("one"),project("two","engineer","org-b")];error=null;
  order.mockImplementation(()=>Promise.resolve({data:projects,error}));
  select.mockReturnValue({order});from.mockReturnValue({select});
  rpc.mockResolvedValue({data:[{organisation_id:"org-a",name:"Example Engineering"},{organisation_id:"org-b",name:"Another Organisation"}],error:null});
  vi.mocked(requireUser).mockResolvedValue({supabase:{from,rpc},user:{id:"current-user"}} as never);
});
afterEach(cleanup);

describe("all-projects discipline engineer dashboard",()=>{
  it("uses the shared heading and directs each engineering project to My Deliverables",async()=>{
    render(await AllProjectsPage());
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByRole("heading",{name:"Your projects",level:1})).toBeTruthy();
    expect(screen.getByRole("list",{name:"Projects"}).className).toContain("lg:grid-cols-2");
    for(const [id,org] of [["one","org-a"],["two","org-b"]])expect(screen.getByRole("link",{name:`My Deliverables: P-${id} — Project ${id}`}).getAttribute("href")).toBe(`/app/${org}/projects/${id}/assignments`);
    expect(screen.getByText("Example Engineering")).toBeTruthy();
    expect(screen.getByText("Another Organisation")).toBeTruthy();
    expect(screen.queryByRole("button",{name:/create|new project/i})).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("retains appointed-role destinations and makes no additional data reads",async()=>{
    projects=[project("pm","project_admin"),project("dcc","document_controller"),project("engineer"),project("viewer","viewer")];
    render(await AllProjectsPage());
    for(const [id,route] of [["pm","overview"],["dcc","control"],["viewer","documents"]])expect(screen.getByRole("link",{name:`Open project: P-${id} — Project ${id}`}).getAttribute("href")).toBe(`/app/org-a/projects/${id}/${route}`);
    expect(screen.getByRole("link",{name:"My Deliverables: P-engineer — Project engineer"}).getAttribute("href")).toBe("/app/org-a/projects/engineer/assignments");
    expect(requireUser).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledExactlyOnceWith("project_access");
    expect(select).toHaveBeenCalledExactlyOnceWith("organisation_id,project_id,code,name,role");
    expect(order).toHaveBeenCalledExactlyOnceWith("name");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_organisations");
  });

  it("keeps literal full project names readable and wraps long identifiers",async()=>{
    const name=`Long engineering project ${"name ".repeat(15)}<script>alert('unsafe')</script>`;
    projects=[{...project("long"),name}];
    const {container}=render(await AllProjectsPage());
    const link=screen.getByRole("link",{name:`My Deliverables: P-long — ${name}`});
    const heading=within(link).getByRole("heading",{level:2});
    expect(heading.textContent).toBe(name);
    expect(heading.className).toContain("break-words");
    expect(container.querySelector("script")).toBeNull();
    expect(link.className).toContain("min-w-0");
  });

  it("shows a quiet empty state without fabricated metrics or inactive links",async()=>{
    projects=[];
    render(await AllProjectsPage());
    expect(screen.getByRole("heading",{name:"No authorised projects yet"})).toBeTruthy();
    expect(screen.queryByRole("list",{name:"Projects"})).toBeNull();
    expect(screen.queryByRole("link",{name:/My Deliverables|Open project/})).toBeNull();
  });

  it("does not present failed access as an empty successful dashboard",async()=>{
    error={code:"ACCESS_FAILED"};
    await expect(AllProjectsPage()).rejects.toThrow("Project access failed: ACCESS_FAILED");
  });
});
