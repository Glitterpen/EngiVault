import {afterEach,describe,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import Home,{metadata} from "./page";

afterEach(cleanup);

describe("clean public EngiCite landing page",()=>{
  it("provides one primary heading, a main landmark and labelled navigation and sections",()=>{
    render(<Home/>);
    expect(screen.getAllByRole("main")).toHaveLength(1);
    const headings=screen.getAllByRole("heading",{level:1});expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toContain("Every deliverable.");expect(headings[0].textContent).toContain("One clear path.");
    expect(screen.getByRole("navigation",{name:"Main navigation"})).toBeTruthy();
    for(const name of ["A connected view of engineering delivery.","From the first plan to the next issue.","Bring clarity to your next project."]){
      const section=screen.getByRole("region",{name});
      const label=document.getElementById(section.getAttribute("aria-labelledby")!);
      expect(label?.tagName).toBe("H2");expect(section.contains(label)).toBe(true);
    }
    expect(screen.getByRole("list",{name:"Core benefits"})).toBeTruthy();
    expect(screen.getByRole("main").getAttribute("tabindex")).toBe("-1");
  });
  it("keeps every section anchor resolvable and provides a working skip-link target",()=>{
    const {container}=render(<Home/>);
    const anchors=Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    expect(anchors.length).toBeGreaterThan(3);
    for(const anchor of anchors){const target=anchor.getAttribute("href")!.slice(1);expect(target).not.toBe("");expect(document.getElementById(target)).toBeTruthy();}
    expect(screen.getByRole("link",{name:"Skip to content"}).getAttribute("href")).toBe("#landing-content");
    const ids=Array.from(container.querySelectorAll<HTMLElement>("[id]")).map(item=>item.id);expect(new Set(ids).size).toBe(ids.length);
  });
  it("describes actual register, revision, review, issue and progress capabilities without invented guarantees",()=>{
    render(<Home/>);
    const section=screen.getByRole("region",{name:"A connected view of engineering delivery."});
    expect(within(section).getAllByRole("article")).toHaveLength(6);
    for(const name of ["One clear document register","Follow every revision","Keep reviews connected","Issue the right document set","See where delivery stands","Find answers with context"])expect(within(section).getByRole("heading",{name,level:3})).toBeTruthy();
    expect(section.textContent).toContain("Import your master document register (MDR)");
    expect(section.textContent).toContain("approve or return submissions");
    expect(section.textContent).toContain("newly approved, staged and previously transmitted revisions");
    expect(section.textContent).toContain("submitted and DCC-accepted progress");
    expect(section.textContent).toContain("where enabled");expect(section.textContent).toContain("Check the cited revision and source before acting");
    expect(document.body.textContent).not.toMatch(/SOC\s*2|ISO\s*27001|certified|unhackable|100\s*%\s*secure|99\.9\s*%|guaranteed|Vercel|Supabase|Railway|Cloudflare|OpenAI/i);
    expect(document.body.textContent).not.toMatch(/\d[\d,]*\+\s*(customers|teams|organisations|projects)|\d+\s*%\s*(faster|reduction|uptime)/i);
  });
  it("labels its illustrative document statuses as examples rather than live customer metrics",()=>{
    render(<Home/>);
    const preview=screen.getByRole("figure",{name:"Project deliverables"});
    const caption=within(preview).getByText("Workflow illustration · not live project data.");expect(caption.tagName).toBe("FIGCAPTION");
    expect(within(preview).getAllByRole("listitem")).toHaveLength(3);
    for(const status of ["In DCC review","DCC accepted","Ready for transmittal"])expect(within(preview).getByText(status)).toBeTruthy();
    for(const purpose of ["IFR","IFA","IFC"])expect(preview.textContent).toContain(purpose);
    expect(within(preview).queryByRole("progressbar")).toBeNull();
  });
  it("retains clear login and organisation registration destinations without granting project access",()=>{
    render(<Home/>);
    expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link",{name:"Sign in to your workspace"}).getAttribute("href")).toBe("/login");
    const registrations=screen.getAllByRole("link",{name:"Register your organisation"});expect(registrations).toHaveLength(2);
    expect(registrations.every(link=>link.getAttribute("href")==="/register")).toBe(true);
    expect(screen.getByRole("link",{name:"EngiCite home"}).getAttribute("href")).toBe("/");
    expect(screen.getByText(/Individual project accounts are created through authorised invitations/)).toBeTruthy();
    expect(screen.queryByRole("link",{name:"Open workspace"})).toBeNull();
  });
  it("keeps the native enquiry disclosure collapsed initially without removing the mounted form",()=>{
    const {container}=render(<Home/>);
    const summary=screen.getByText("Send an enquiry",{selector:"summary"});
    const disclosure=summary.closest("details")!;expect(disclosure.open).toBe(false);expect(disclosure.querySelector('form[aria-label="Organisation enquiry"]')).toBeTruthy();
    expect(container.querySelectorAll("details")).toHaveLength(1);
    fireEvent.click(summary);expect(disclosure.open).toBe(true);expect(screen.getByRole("form",{name:"Organisation enquiry"})).toBeTruthy();
    fireEvent.click(summary);expect(disclosure.open).toBe(false);
  });
  it("preserves accessible required enquiry fields and autofill hints without submitting",()=>{
    render(<Home/>);fireEvent.click(screen.getByText("Send an enquiry",{selector:"summary"}));
    const form=screen.getByRole("form",{name:"Organisation enquiry"}) as HTMLFormElement;
    for(const [label,name,type,autocomplete] of [["Name","name","text","name"],["Work email","email","email","email"],["Company","company","text","organization"]] as const){
      const input=within(form).getByLabelText(label) as HTMLInputElement;
      expect(input.name).toBe(name);expect(input.type).toBe(type);expect(input.autocomplete).toBe(autocomplete);expect(input.required).toBe(true);expect(input.id).not.toBe("");
      expect(form.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    }
    const message=within(form).getByLabelText("How can EngiCite help your team?") as HTMLTextAreaElement;
    expect(message.tagName).toBe("TEXTAREA");expect(message.required).toBe(true);expect(message.name).toBe("message");expect(message.rows).toBe(4);
    expect((within(form).getByRole("button",{name:"Send enquiry"}) as HTMLButtonElement).type).toBe("submit");
  });
  it("preserves the external POST destination and hidden enquiry values without initiating network activity",()=>{
    render(<Home/>);fireEvent.click(screen.getByText("Send an enquiry",{selector:"summary"}));
    const form=screen.getByRole("form",{name:"Organisation enquiry"}) as HTMLFormElement;
    expect(form.method).toBe("post");expect(form.getAttribute("action")).toBe("https://formsubmit.co/df53e103555f05354c758393cdc06861");
    fireEvent.change(within(form).getByLabelText("Name"),{target:{value:"Synthetic Contact"}});fireEvent.change(within(form).getByLabelText("Work email"),{target:{value:"synthetic@example.test"}});fireEvent.change(within(form).getByLabelText("Company"),{target:{value:"Synthetic Engineering"}});fireEvent.change(within(form).getByLabelText("How can EngiCite help your team?"),{target:{value:"A synthetic workflow enquiry for local tests only."}});
    expect(Object.fromEntries(new FormData(form))).toEqual({_subject:"New EngiCite early-access enquiry",_template:"table",_captcha:"false",_next:"https://engicite.com/?sent=1#early-access",name:"Synthetic Contact",email:"synthetic@example.test",company:"Synthetic Engineering",message:"A synthetic workflow enquiry for local tests only."});
    const hidden=Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'));expect(hidden.map(input=>input.name)).toEqual(["_subject","_template","_captcha","_next"]);
  });
  it("attributes EngiCite to EngiOne LTD with its supplied logo and descriptive metadata",()=>{
    render(<Home/>);
    const footer=screen.getByRole("contentinfo");expect(footer.textContent).toContain("EngiCite is a product of EngiOne LTD.");
    expect(footer.textContent).toContain(`© ${new Date().getFullYear()} EngiOne LTD. All rights reserved.`);
    const logo=within(footer).getByRole("img",{name:"EngiOne LTD"});expect(logo.getAttribute("src")).toContain(encodeURIComponent("/engione-logo.png"));expect(logo.getAttribute("width")).toBe("480");expect(logo.getAttribute("height")).toBe("160");expect(logo.getAttribute("sizes")).toBe("160px");
    expect(metadata.title).toBe("Engineering delivery, clearly controlled");expect(metadata.description).toContain("EngiCite is a product of EngiOne LTD.");
  });
});
