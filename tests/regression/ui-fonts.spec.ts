import { expect, loadDemo, test } from "./fixtures";
import { auditFonts, setTheme, THEME_FONT_ROLES, UI_THEMES } from "./ui/fontAudit";

test.describe("UI typography and theme contracts", () => {
  test("[REG-UI-002] @ui @font @security loads production fonts locally without fallback or external traffic", async ({ radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      const audit = await auditFonts(page, theme, testInfo);
      expect(audit.externalResources).toEqual([]);
      for (const [role, family] of Object.entries(audit.expected)) {
        expect(audit.loaded[role as keyof typeof audit.loaded], `${family} should be available`).toBe(true);
        expect(
          audit.loadedFaces.some((face) => face.family === family && face.status === "loaded"),
          `${family} should have a loaded FontFace`
        ).toBe(true);
      }
    }
  });

  test("[REG-UI-003] @ui @font resolves every theme's display, sans, and mono roles", async ({ radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      const audit = await auditFonts(page, theme, testInfo);
      expect(audit.resolved).toEqual(THEME_FONT_ROLES[theme]);
    }
  });

  test("[REG-UI-004] @ui @usability preserves role-based text size and line-height", async ({ radarPage: page }) => {
    await loadDemo(page);
    const measurements = await page.evaluate(() => {
      const measure = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing type sample: ${selector}`);
        const style = getComputedStyle(element);
        return {
          selector,
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          multiline: element instanceof HTMLTextAreaElement || element.tagName === "PRE"
        };
      };
      return [
        measure("[data-testid='browserAddress']"),
        measure("[data-testid='trafficDetailText']"),
        measure("[data-testid='captureComment']"),
        measure("[data-testid='cloneToRepeater']"),
        measure("[data-testid='sessionSelector']"),
        measure("[data-testid='telemetryTicker']")
      ];
    });

    for (const measurement of measurements) {
      const minimum = measurement.selector.includes("telemetryTicker")
        ? 10
        : measurement.selector.includes("sessionSelector")
          ? 12
          : 13;
      expect(measurement.fontSize, measurement.selector).toBeGreaterThanOrEqual(minimum);
      if (measurement.multiline) {
        expect(measurement.lineHeight / measurement.fontSize, measurement.selector).toBeGreaterThanOrEqual(1.35);
      }
    }
  });

  test("[REG-UI-017] @ui @usability keeps theme text, focus, state, and selection token pairs distinguishable", async ({ radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      const contrasts = await page.evaluate(() => {
        const probe = document.createElement("span");
        document.body.append(probe);
        const resolve = (value: string) => {
          probe.style.color = value;
          const color = getComputedStyle(probe).color;
          const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [0, 0, 0];
          return channels;
        };
        const luminance = (channels: number[]) => {
          const linear = channels.map((channel) => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const contrast = (foreground: string, background: string) => {
          const left = luminance(resolve(foreground));
          const right = luminance(resolve(background));
          return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
        };
        const root = getComputedStyle(document.documentElement);
        const pairs = [
          ["copy-on-ink", "--theme-copy", "--theme-ink", 4.5],
          ["bone-on-surface", "--theme-bone", "--theme-surface", 4.5],
          ["signal-on-ink", "--theme-signal", "--theme-ink", 3],
          ["selection", "--theme-selection-fg", "--theme-selection-bg", 4.5],
          ["focus-on-ink", "--theme-focus", "--theme-ink", 3]
        ] as const;
        const result = pairs.map(([name, foreground, background, minimum]) => ({
          name,
          ratio: contrast(root.getPropertyValue(foreground), root.getPropertyValue(background)),
          minimum
        }));
        probe.remove();
        return result;
      });
      for (const pair of contrasts) {
        expect(pair.ratio, `${theme} ${pair.name}`).toBeGreaterThanOrEqual(pair.minimum);
      }
    }
  });

  test("[REG-UI-022] @ui @platform @font loads all pinned font roles at native platform scale", async ({ radarPage: page }, testInfo) => {
    await loadDemo(page);
    testInfo.annotations.push({ type: "ui-platform", description: process.platform });
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      const audit = await auditFonts(page, theme, testInfo);
      expect(Object.values(audit.loaded).every(Boolean)).toBe(true);
      expect(audit.externalResources).toEqual([]);
    }
    await expect(page.getByTestId("radarShell")).toBeVisible();
  });
});
