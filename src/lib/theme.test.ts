// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme, isThemeId, readStoredTheme, storeTheme, themeOption, THEME_IDS } from "./theme";

describe("theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dataset.theme = "";
  });

  it("exposes six themes", () => {
    expect(THEME_IDS).toEqual(["bureau", "vellum", "specter", "aperture", "verdigris", "aegis"]);
  });

  it("defaults to bureau", () => {
    expect(readStoredTheme()).toBe("bureau");
  });

  it("persists selected theme", () => {
    storeTheme("specter");
    expect(readStoredTheme()).toBe("specter");
  });

  it("applies theme to the document root", () => {
    applyTheme("vellum");
    expect(document.documentElement.dataset.theme).toBe("vellum");
  });

  it("validates theme ids", () => {
    expect(isThemeId("vellum")).toBe(true);
    expect(isThemeId("neon")).toBe(false);
  });

  it("returns metadata for active theme", () => {
    expect(themeOption("vellum").label).toBe("Vellum");
  });
});
