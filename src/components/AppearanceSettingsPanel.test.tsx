// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel";

describe("AppearanceSettingsPanel", () => {
  it("renders theme options when open", async () => {
    render(
      <AppearanceSettingsPanel open themeId="bureau" onClose={vi.fn()} onThemeChange={vi.fn()} />
    );
    expect(await screen.findByTestId("appearanceSettingsPanel")).toBeInTheDocument();
    expect(screen.getByTestId("themeOption-bureau")).toBeInTheDocument();
    expect(screen.getByTestId("themeOption-vellum")).toBeInTheDocument();
    expect(screen.getByTestId("themeOption-specter")).toBeInTheDocument();
  });

  it("selects a theme", async () => {
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppearanceSettingsPanel open themeId="bureau" onClose={vi.fn()} onThemeChange={onThemeChange} />
    );
    await user.click(screen.getByTestId("themeOption-vellum"));
    expect(onThemeChange).toHaveBeenCalledWith("vellum");
  });
});
