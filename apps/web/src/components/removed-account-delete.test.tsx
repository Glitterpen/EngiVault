import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {RemovedAccountDelete} from "./removed-account-delete";
vi.mock("@/app/app/account-deletion-actions",()=>({deleteRemovedMemberAccount:vi.fn()}));
afterEach(cleanup);
it("requires matching email and acknowledgement before deletion",()=>{
  render(<RemovedAccountDelete organisationId="org" userId="member" email="engineer@example.test"/>);
  expect(screen.queryByRole("button",{name:"Confirm account deletion"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Delete account"}));
  const submit=screen.getByRole("button",{name:"Confirm account deletion"}) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Type engineer/),{target:{value:"wrong@example.test"}});
  fireEvent.click(screen.getByRole("checkbox"));expect(submit.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText(/Type engineer/),{target:{value:"engineer@example.test"}});expect(submit.disabled).toBe(false);
  expect(screen.getByText(/Submitted documents and audit history/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(screen.queryByRole("button",{name:"Confirm account deletion"})).toBeNull();
});
