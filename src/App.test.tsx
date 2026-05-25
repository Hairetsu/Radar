// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the workbench shell", async () => {
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Traffic" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://")).toBeInTheDocument();
    expect(screen.getByText(/Attack Surface Workbench/i)).toBeInTheDocument();
  });
});
