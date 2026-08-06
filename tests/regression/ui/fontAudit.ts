import type { Page, TestInfo } from "@playwright/test";

export const UI_THEMES = ["bureau", "vellum", "specter", "aperture", "verdigris", "aegis"] as const;
export type UiTheme = (typeof UI_THEMES)[number];
export type FontRole = "display" | "sans" | "mono";

export const THEME_FONT_ROLES: Record<UiTheme, Record<FontRole, string>> = {
  bureau: { display: "Antonio", sans: "Saira", mono: "JetBrains Mono" },
  vellum: { display: "Instrument Serif", sans: "Hanken Grotesk", mono: "DM Mono" },
  specter: { display: "Unbounded", sans: "Sora", mono: "Space Mono" },
  aperture: { display: "Unbounded", sans: "Hanken Grotesk", mono: "JetBrains Mono" },
  verdigris: { display: "Instrument Serif", sans: "Saira", mono: "DM Mono" },
  aegis: { display: "Antonio", sans: "Sora", mono: "Space Mono" }
};

export type FontAudit = {
  theme: UiTheme;
  expected: Record<FontRole, string>;
  resolved: Record<FontRole, string>;
  loaded: Record<FontRole, boolean>;
  loadedFaces: Array<{
    family: string;
    style: string;
    weight: string;
    status: FontFaceLoadStatus;
  }>;
  externalResources: string[];
};

function unquote(value: string) {
  return value.replace(/^['"]|['"]$/g, "").trim();
}

export async function setTheme(page: Page, theme: UiTheme, testInfo?: TestInfo) {
  const current = await page.locator("html").getAttribute("data-theme");
  if (current !== theme) {
    await page.getByTestId("openAppearanceSettings").click();
    await page.getByTestId(`themeOption-${theme}`).click();
    await page.locator("html").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Close appearance settings" }).click();
  }
  await page.waitForFunction((requested) => document.documentElement.dataset.theme === requested, theme);
  testInfo?.annotations.push({ type: "ui-theme", description: theme });
}

export async function waitForFonts(page: Page, theme: UiTheme) {
  const families = Object.values(THEME_FONT_ROLES[theme]);
  await page.evaluate(async (expectedFamilies) => {
    await document.fonts.ready;
    await Promise.all(
      expectedFamilies.flatMap((family) => [
        document.fonts.load(`400 16px "${family}"`, "Radar evidence À中🔐"),
        document.fonts.load(`700 16px "${family}"`, "Radar evidence À中🔐")
      ])
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, families);
}

export async function auditFonts(page: Page, theme: UiTheme, testInfo?: TestInfo): Promise<FontAudit> {
  await waitForFonts(page, theme);
  const expected = THEME_FONT_ROLES[theme];
  const audit = await page.evaluate(({ expectedFonts, activeTheme }) => {
    const roleSelectors: Record<FontRole, string> = {
      display: ".font-display",
      sans: ".font-sans, [data-testid='radarShell']",
      mono: ".font-mono"
    };
    const resolved = Object.fromEntries(
      Object.entries(roleSelectors).map(([role, selector]) => {
        const element = document.querySelector(selector);
        const family = element ? getComputedStyle(element).fontFamily.split(",")[0]?.trim() || "" : "";
        return [role, family.replace(/^['"]|['"]$/g, "")];
      })
    ) as Record<FontRole, string>;
    const loaded = Object.fromEntries(
      Object.entries(expectedFonts).map(([role, family]) => [
        role,
        document.fonts.check(`400 16px "${family}"`, "Radar evidence")
      ])
    ) as Record<FontRole, boolean>;
    const loadedFaces = Array.from(document.fonts).map((face) => ({
      family: face.family.replace(/^['"]|['"]$/g, ""),
      style: face.style,
      weight: face.weight,
      status: face.status
    }));
    const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
    const styleSheets = Array.from(document.styleSheets)
      .map((sheet) => sheet.href || "")
      .filter(Boolean);
    const externalResources = [...new Set([...resources, ...styleSheets])].filter((url) => {
      try {
        const parsed = new URL(url);
        return ["http:", "https:"].includes(parsed.protocol) && !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname);
      } catch {
        return false;
      }
    });
    return { theme: activeTheme, expected: expectedFonts, resolved, loaded, loadedFaces, externalResources };
  }, { expectedFonts: expected, activeTheme: theme });

  const normalized: FontAudit = {
    ...audit,
    resolved: {
      display: unquote(audit.resolved.display),
      sans: unquote(audit.resolved.sans),
      mono: unquote(audit.resolved.mono)
    }
  };
  if (testInfo) {
    await testInfo.attach(`font-audit-${theme}.json`, {
      body: Buffer.from(`${JSON.stringify(normalized, null, 2)}\n`),
      contentType: "application/json"
    });
  }
  return normalized;
}
