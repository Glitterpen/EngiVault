import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {ProjectTeamDirectory,type ProjectTeamMember} from "./project-team-directory";
import {AdminPreviewBoundary} from "./admin-preview-boundary";

vi.mock("@/app/app/workflow-actions",()=>({setMemberDiscipline:vi.fn(),setMemberRole:vi.fn()}));
vi.mock("@/components/project-member-remove",()=>({ProjectMemberRemove:({member}:{member:{name:string}})=><button type="button">Remove appointment for {member.name}</button>}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const members:ProjectTeamMember[]=[
  {user_id:"lead",display_name:"Taylor Project Lead",email:"taylor@example.test",role:"project_admin",disciplines:[]},
  {user_id:"controller",display_name:"Morgan Document Control",email:"morgan@example.test",role:"document_controller",disciplines:[]},
  {user_id:"engineer",display_name:"Alex Multidiscipline",email:"alex@example.test",role:"engineer",disciplines:["Electrical","Instrumentation"]},
  {user_id:"unassigned",display_name:"Sam New Engineer",email:"sam@example.test",role:"engineer",disciplines:[]},
];
const props={organisationId:"org",projectId:"project",members,disciplines:[{name:"Electrical",code:"ELE"},{name:"Process",code:"PRC"}],role:"project_admin",currentUserId:"lead",emptyMessage:"No active project members."};
afterEach(()=>{cleanup();vi.clearAllMocks();});
function manage(name:string){const article=screen.getByRole("article",{name});fireEvent.click(article.querySelector("summary")!);return within(article);}
function fields(form:HTMLElement){return Object.fromEntries(new FormData(form as HTMLFormElement));}

describe("Project team directory",()=>{
  it("shows a compact named directory with exact identities and initially closed management controls",()=>{
    render(<ProjectTeamDirectory {...props}/>);
    expect(screen.getByRole("region",{name:"Active team members"})).toBeTruthy();
    expect(screen.getByText("alex@example.test")).toBeTruthy();
    expect(screen.getByText("No discipline assigned")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("4 of 4 members");
    expect([...document.querySelectorAll("details")].every(item=>!item.open)).toBe(true);
  });
  it.each(["alex","ALEX@EXAMPLE.TEST","Instrumentation","Discipline Engineer","project manager"])("searches names, emails, disciplines and readable roles: %s",query=>{
    render(<ProjectTeamDirectory {...props}/>);
    fireEvent.change(screen.getByRole("searchbox",{name:"Search team members"}),{target:{value:query}});
    expect(screen.getByRole("list",{name:"Active project team"}).children.length).toBe(query==="Discipline Engineer"?2:1);
  });
  it("clears a no-result search and preserves the original member order",()=>{
    render(<ProjectTeamDirectory {...props}/>);
    fireEvent.change(screen.getByRole("searchbox"),{target:{value:"missing-person"}});
    expect(screen.getByText("No team members match your search.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Clear team search"}));
    expect(screen.getAllByRole("heading",{level:3}).map(h=>h.textContent)).toEqual(members.map(m=>m.display_name));
  });
  it("keeps the exact discipline add and removal fields",()=>{
    render(<ProjectTeamDirectory {...props}/>);
    const row=manage("Alex Multidiscipline");
    const add=row.getByRole("form",{name:"Add authorised discipline for Alex Multidiscipline"});
    fireEvent.change(within(add).getByRole("combobox"),{target:{value:"Process"}});
    expect(fields(add)).toEqual({organisationId:"org",projectId:"project",userId:"engineer",enabled:"true",discipline:"Process"});
    const remove=row.getByRole("button",{name:"Remove Instrumentation access from Alex Multidiscipline"}).closest("form")!;
    expect(fields(remove)).toEqual({organisationId:"org",projectId:"project",userId:"engineer",discipline:"Instrumentation",enabled:"false"});
    expect(row.getByRole("button",{name:"Remove appointment for Alex Multidiscipline"})).toBeTruthy();
  });
  it("keeps leadership role fields and administrator-only appointment choices",()=>{
    render(<ProjectTeamDirectory {...props} role="organisation_admin" currentUserId="owner"/>);
    const row=manage("Morgan Document Control");
    const form=row.getByRole("form",{name:"Update project role for Morgan Document Control"});
    expect(fields(form)).toEqual({organisationId:"org",projectId:"project",userId:"controller",role:"document_controller"});
    expect(within(form).getAllByRole("option").map(o=>o.getAttribute("value"))).toEqual(["project_admin","document_controller"]);
    expect(screen.queryByRole("button",{name:"Add discipline"})).toBeNull();
  });
  it("does not offer removal of the current user's appointment",()=>{
    render(<ProjectTeamDirectory {...props} role="organisation_admin" currentUserId="controller"/>);
    const row=manage("Morgan Document Control");
    expect(row.queryByRole("button",{name:"Remove appointment for Morgan Document Control"})).toBeNull();
  });
  it("gives DCC a read-only directory without management controls",()=>{
    render(<ProjectTeamDirectory {...props} role="document_controller"/>);
    expect(document.querySelectorAll("form,details").length).toBe(0);
    expect(screen.getByText("alex@example.test")).toBeTruthy();
  });
  it("prevents new discipline assignment when the project has no active disciplines",()=>{
    render(<ProjectTeamDirectory {...props} disciplines={[]}/>);
    const row=manage("Alex Multidiscipline");
    expect(row.getByRole("button",{name:"Add discipline"}).hasAttribute("disabled")).toBe(true);
    expect(row.getByText("Configure an active MDR discipline category first.")).toBeTruthy();
  });
  it("reopens management details on native validation errors",()=>{
    render(<ProjectTeamDirectory {...props}/>);
    const form=document.querySelector<HTMLFormElement>('form[aria-label="Add authorised discipline for Alex Multidiscipline"]')!;
    fireEvent.invalid(form.querySelector('select')!);
    expect(form.closest("details")?.open).toBe(true);
  });
  it("shows an honest empty state",()=>{
    render(<ProjectTeamDirectory {...props} members={[]}/>);
    expect(screen.getByText(props.emptyMessage)).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Clear team search"})).toBeNull();
  });
  it("keeps search usable in audited preview while locking all mutation fields",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"project_admin",displayName:"Preview manager",disciplines:[],expiresAt:"2030-01-01"}}><ProjectTeamDirectory {...props}/></AdminPreviewBoundary>);
    const search=screen.getByRole("searchbox",{name:"Search team members"});
    expect(search.hasAttribute("disabled")).toBe(false);
    fireEvent.change(search,{target:{value:"Alex"}});
    const row=manage("Alex Multidiscipline");
    expect(row.getByRole("button",{name:"Add discipline"}).hasAttribute("disabled")).toBe(true);
    expect(row.getByRole("combobox",{name:"Add authorised discipline"}).hasAttribute("disabled")).toBe(true);
  });
});
