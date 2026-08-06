// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
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
    expect(screen.getByTestId("themeOption-aperture")).toBeInTheDocument();
    expect(screen.getByTestId("themeOption-verdigris")).toBeInTheDocument();
    expect(screen.getByTestId("themeOption-aegis")).toBeInTheDocument();
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

  it("selects a newly added theme", async () => {
    const onThemeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <AppearanceSettingsPanel open themeId="bureau" onClose={vi.fn()} onThemeChange={onThemeChange} />
    );
    await user.click(screen.getByTestId("themeOption-verdigris"));
    expect(onThemeChange).toHaveBeenCalledWith("verdigris");
  });

  it("restores focus to the control that opened it", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open appearance</button>
          <AppearanceSettingsPanel
            open={open}
            themeId="bureau"
            onClose={() => setOpen(false)}
            onThemeChange={vi.fn()}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open appearance" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Close appearance settings" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
