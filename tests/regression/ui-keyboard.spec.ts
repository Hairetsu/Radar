import { expect, loadDemo, test } from "./fixtures";
import { applyWindowProfile } from "./ui/windowProfiles";

test.describe("UI keyboard contracts", () => {
  test("[REG-UI-015] @ui @usability keeps keyboard focus visible and onscreen", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    await page.getByTestId("radarShell").focus();

    for (let step = 0; step < 36; step += 1) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement)) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const viewSwitch = element.closest<HTMLElement>('[data-testid="viewSwitch"]');
        return {
          name: element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText || element.tagName,
          intersects: rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
          visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0,
          focusVisible: style.outlineStyle !== "none" || style.boxShadow !== "none" || style.borderColor === getComputedStyle(document.documentElement).getPropertyValue("--theme-signal").trim(),
          rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          viewport: { width: innerWidth, height: innerHeight },
          viewSwitch: viewSwitch
            ? { scrollLeft: viewSwitch.scrollLeft, scrollWidth: viewSwitch.scrollWidth, clientWidth: viewSwitch.clientWidth }
            : null
        };
      });
      const focusContext = JSON.stringify(focus);
      expect(focus, `Tab step ${step + 1}`).not.toBeNull();
      expect(focus?.visible, focusContext).toBe(true);
      expect(focus?.intersects, focusContext).toBe(true);
      expect(focus?.focusVisible, focusContext).toBe(true);
    }
  });

  test("[REG-UI-016] @ui @usability restores focus after Escape and close actions", async ({ radarPage: page }) => {
    await loadDemo(page);

    const searchTrigger = page.getByTestId("openGlobalSearch");
    await searchTrigger.focus();
    await searchTrigger.press("Enter");
    await expect(page.getByTestId("globalSearchInput")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(searchTrigger).toBeFocused();

    const appearanceTrigger = page.getByTestId("openAppearanceSettings");
    await appearanceTrigger.focus();
    await appearanceTrigger.press("Enter");
    await expect(page.getByTestId("appearanceSettingsPanel")).toBeVisible();
    await page.getByRole("button", { name: "Close appearance settings" }).click();
    await expect(appearanceTrigger).toBeFocused();
  });
});
