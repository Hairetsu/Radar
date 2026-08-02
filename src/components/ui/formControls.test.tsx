// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";
import { Select } from "./select";
import { Textarea } from "./textarea";

describe("form control accessibility", () => {
  it("retains placeholder guidance as an accessible name", () => {
    render(
      <>
        <Input placeholder="Capture comment" />
        <Textarea placeholder="Request body" />
      </>
    );

    expect(screen.getByRole("textbox", { name: "Capture comment" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Request body" })).toBeInTheDocument();
  });

  it("prefers an explicit accessible name", () => {
    render(<Input placeholder="https://target.test" aria-label="Browser address" />);
    expect(screen.getByRole("textbox", { name: "Browser address" })).toBeInTheDocument();
  });

  it("constrains fields to the width assigned by their layout", () => {
    render(
      <div className="grid grid-cols-2">
        <Input aria-label="Owner" />
        <Select aria-label="Status">
          <option>Draft</option>
        </Select>
      </div>
    );

    expect(screen.getByRole("textbox", { name: "Owner" })).toHaveClass("w-full");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveClass("w-full");
  });
});
