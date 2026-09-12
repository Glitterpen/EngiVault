import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {NotificationPreferencesForm} from "./notification-preferences-form";
vi.mock("@/app/app/notification-preference-actions",()=>({saveNotificationPreferences:vi.fn()}));
afterEach(cleanup);
it("keeps in-app notifications on while selecting only email disciplines and events",()=>{
 render(<NotificationPreferencesForm organisationId="org" projectId={null} preferences={{emailEnabled:true,disciplines:null,events:null,choices:["Process","Electrical"]}}/>);
 expect(screen.getByText("In-app notifications: All enabled")).toBeTruthy();
 expect((screen.getByRole("checkbox",{name:"Process"}) as HTMLInputElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole("checkbox",{name:"All disciplines and general notices"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"Process"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"All events"}));
 fireEvent.click(screen.getByRole("checkbox",{name:"New document submissions"}));
 const form=screen.getByRole("button",{name:"Save my email preferences"}).closest("form")!;
 const data=new FormData(form);expect(data.getAll("disciplines")).toEqual(["Process"]);expect(data.getAll("events")).toEqual(["submissions"]);
 fireEvent.click(screen.getByRole("checkbox",{name:"Receive event emails"}));
 expect(screen.getByText("In-app notifications: All enabled")).toBeTruthy();
});
