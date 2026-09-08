import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DocumentTypeInput } from "./document-type-input";

afterEach(cleanup);

describe("Document type input", () => {
  it("offers standard types but accepts a custom value", () => {
    const { container } = render(<DocumentTypeInput suggestions={[{ code: "REP", name: "Report" }]} />);
    const input = screen.getByLabelText("Document type") as HTMLInputElement;
    expect(container.querySelector("datalist option")?.getAttribute("value")).toBe("Report");
    fireEvent.change(input, { target: { value: "Vendor Equipment Layout" } });
    expect(input.value).toBe("Vendor Equipment Layout");
    expect(input.checkValidity()).toBe(true);
    expect(input.required).toBe(true);
    expect(input.maxLength).toBe(80);
  });

  it("lets DCC edit existing custom types without a category list", () => {
    render(<DocumentTypeInput defaultValue="Operating Envelope" />);
    const input = screen.getByLabelText("Document type") as HTMLInputElement;
    expect(input.value).toBe("Operating Envelope");
    fireEvent.change(input, { target: { value: "" } });
    expect(input.checkValidity()).toBe(false);
  });
});
