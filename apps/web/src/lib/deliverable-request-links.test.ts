import {describe,expect,it} from "vitest";
import {notificationDestination} from "./notification-links";
describe("deliverable request notification destinations",()=>{
  const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001";
  it("opens the exact request including decisions in history",()=>{
    const href=`/app/${organisationId}/projects/${projectId}/requests?request=c0000000-0000-4000-8000-000000000001#request-c0000000-0000-4000-8000-000000000001`;
    expect(notificationDestination({href,organisationId,projectId})).toBe(href);
  });
  it("does not allow a request link to another tenant",()=>{
    expect(notificationDestination({href:`/app/other/projects/${projectId}/requests`,organisationId,projectId})).toBeNull();
  });
});
