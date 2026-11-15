import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AccountUsePolicyPage, { metadata } from "./page";
import { REGISTRATION_POLICY_DISPLAY_VERSION } from "@/lib/account-use-acknowledgement";
import { REGISTRATION_POLICY_SECTIONS } from "@/lib/registration-policy-content";

afterEach(cleanup);

describe("standalone registration policy notice", () => {
  it("offers the full versioned policy for reading without account details or an agreement form", () => {
    render(<AccountUsePolicyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Policy, Security and Data Protection" })).toBeTruthy();
    expect(screen.getByText(`Registration notice · ${REGISTRATION_POLICY_DISPLAY_VERSION}`)).toBeTruthy();
    const contents = screen.getByRole("navigation", { name: "Policy sections" });
    const links = within(contents).getAllByRole("link");
    expect(links).toHaveLength(REGISTRATION_POLICY_SECTIONS.length);
    REGISTRATION_POLICY_SECTIONS.forEach((section, index) => {
      const link = links[index];
      const heading = screen.getByRole("heading", { level: 2, name: `${index + 1}. ${section.title}` });
      expect(link.getAttribute("href")).toBe(`#${heading.id}`);
      expect(heading.tabIndex).toBe(-1);
    });
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("provides a public privacy contact without requiring a user account", () => {
    render(<AccountUsePolicyPage />);
    const rights = screen.getByRole("region", { name: /Your privacy rights and how to raise a concern/ });
    const contact = within(rights).getByRole("link", { name: "privacy@engicite.com" });
    expect(contact.getAttribute("href")).toBe("mailto:privacy@engicite.com");
    expect(within(rights).getByText(/before creating an account or signing in/)).toBeTruthy();
  });

  it("leads with provider commitments and safeguards before the registration declarations", () => {
    render(<AccountUsePolicyPage />);
    const providerHeading = screen.getByRole("heading", { name: "2. EngiOne LTD’s responsibilities" });
    const providerLink = screen.getByRole("link", { name: "EngiOne LTD’s responsibilities" });
    expect(providerLink.getAttribute("href")).toBe(`#${providerHeading.id}`);
    const providerSection = screen.getByRole("region", { name: "2. EngiOne LTD’s responsibilities" });
    expect(within(providerSection).getAllByRole("term")).toHaveLength(5);
    expect(within(providerSection).getByText(/tell your organisation promptly/)).toBeTruthy();
    for (const title of [/How we protect your workspace/, /Setting up or joining a workspace/, /How your organisation and team help protect information/]) {
      expect(providerSection.compareDocumentPosition(screen.getByRole("region", { name: title })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByText(/does not waive your privacy rights/)).toBeTruthy();
  });
});
