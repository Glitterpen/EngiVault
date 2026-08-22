import {describe,expect,it} from "vitest";
import {formatOrganisationSender,sanitiseEmailHeaderText} from "./email-sender";

describe("formatOrganisationSender",()=>{
  it("uses the project organisation as the visible sender",()=>{
    expect(formatOrganisationSender("EngiCite <invitations@mail.engicite.com>","Glitterpen Engineering"))
      .toBe('"Glitterpen Engineering" <invitations@mail.engicite.com>');
  });

  it("removes header line breaks from organisation names",()=>{
    expect(formatOrganisationSender("invitations@mail.engicite.com","Example Ltd\r\nBcc: attacker@example.com"))
      .toBe('"Example Ltd Bcc: attacker@example.com" <invitations@mail.engicite.com>');
  });

  it("keeps the configured value when its address is invalid",()=>{
    expect(formatOrganisationSender("not-an-address","Example Ltd")).toBe("not-an-address");
  });

  it("makes subject text safe for an email header",()=>{
    expect(sanitiseEmailHeaderText("Example Ltd\r\nBcc: attacker@example.com","EngiCite"))
      .toBe("Example Ltd Bcc: attacker@example.com");
  });
});
