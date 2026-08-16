import { expect, loadDemo, test } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  assertNoGlobalHorizontalOverflow,
  assertRequiredControls,
  blockingLayoutViolations,
  collectLayoutMetrics
} from "./ui/layoutAudit";
import { setTheme, UI_THEMES } from "./ui/fontAudit";
import {
  AI_FIRST_REQUIRED_CONTROLS,
  IDENTITY_REQUIRED_CONTROLS,
  openAiFirstConsole,
  openIdentityLab,
  openWorkbenchView,
  PERSISTENT_REQUIRED_CONTROLS,
  prepareRequiredViewState,
  VIEW_REQUIRED_CONTROLS,
  WORKBENCH_VIEWS,
  type RequiredControl,
  type WorkbenchView
} from "./ui/uiStates";
import { applyWindowProfile } from "./ui/windowProfiles";

const SHELL_CONTAINERS: RequiredControl[] = [
  { selector: "[data-testid='radarShell']", label: "Radar shell" },
  { selector: "[data-testid='sidebar']", label: "sidebar" },
  { selector: "[data-testid='workspaceHeader']", label: "workspace header" },
  { selector: "[data-testid='workbenchActionBar']", label: "action bar" },
  { selector: "[data-testid='evidencePane']", label: "evidence pane" },
  { selector: "[data-testid='telemetryTicker']", label: "telemetry ticker" }
];

const CRITICAL_ZOOM_VIEWS: WorkbenchView[] = ["traffic", "repeater", "findings", "workflows"];

async function assertAiOperatorControls(page: Page) {
  await assertRequiredControls(page, AI_FIRST_REQUIRED_CONTROLS);
  for (const panel of [
    { panel: "aiRunRail", toggle: "toggleAiRunRail", label: "run history" },
    { panel: "aiMissionInspector", toggle: "toggleAiInspector", label: "mission inspector" }
  ]) {
    const locator = page.getByTestId(panel.panel);
    if (await locator.isVisible()) {
      continue;
    }
    const toggle = page.getByTestId(panel.toggle);
    await expect(toggle, `${panel.label} toggle should be visible`).toBeVisible();
    await toggle.click();
    await expect(locator, `${panel.label} should open from its responsive toggle`).toBeVisible();
    await toggle.click();
    await expect(locator, `${panel.label} should close without hiding the feed`).toBeHidden();
  }
  await expect(page.getByTestId("aiOperatorFeed")).toBeVisible();
  await expect(page.getByTestId("aiOperatorComposer")).toBeVisible();
}

async function findFormControlOverlaps(page: Page) {
  return page.getByTestId("evidencePane").evaluate((pane) => {
    const controls = Array.from(pane.querySelectorAll<HTMLElement>(
      "input:not([type='hidden']), select, textarea"
    )).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
    const descriptor = (element: HTMLElement) =>
      element.dataset.testid || element.getAttribute("aria-label") || element.id || element.tagName.toLowerCase();
    const gridAncestor = (element: HTMLElement) => {
      let current = element.parentElement;
      while (current && current !== pane) {
        if (getComputedStyle(current).display === "grid") return current;
        current = current.parentElement;
      }
      return pane;
    };
    const collisions: string[] = [];
    for (let leftIndex = 0; leftIndex < controls.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < controls.length; rightIndex += 1) {
        if (gridAncestor(controls[leftIndex]) !== gridAncestor(controls[rightIndex])) continue;
        const left = controls[leftIndex].getBoundingClientRect();
        const right = controls[rightIndex].getBoundingClientRect();
        const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
        const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        if (width > 1 && height > 1) {
          collisions.push(`${descriptor(controls[leftIndex])}/${descriptor(controls[rightIndex])}`);
        }
      }
    }
    return collisions;
  });
}

test.describe("UI layout, reachability, and density contracts", () => {
  test.describe.configure({ timeout: 180_000 });

  test("[REG-UI-001] @ui @ui-critical keeps the minimum-window shell free of global horizontal overflow", async ({ electronApp, radarPage: page }, testInfo) => {
    const profile = await applyWindowProfile(electronApp, page, "minimum", testInfo);
    await assertRequiredControls(page, SHELL_CONTAINERS);
    await assertNoGlobalHorizontalOverflow(page);
    const emptyMetrics = await collectLayoutMetrics({
      page,
      profile,
      theme: "bureau",
      state: "empty",
      required: [...SHELL_CONTAINERS, ...PERSISTENT_REQUIRED_CONTROLS],
      testInfo
    });
    expect(blockingLayoutViolations(emptyMetrics)).toEqual([]);
    expect(emptyMetrics.document.scrollHeight).toBeLessThanOrEqual(emptyMetrics.document.clientHeight + 1);

    await loadDemo(page);
    const demoMetrics = await collectLayoutMetrics({
      page,
      profile,
      theme: "bureau",
      state: "demo",
      required: [...SHELL_CONTAINERS, ...PERSISTENT_REQUIRED_CONTROLS],
      testInfo
    });
    expect(blockingLayoutViolations(demoMetrics)).toEqual([]);
    expect(demoMetrics.document.scrollHeight).toBeLessThanOrEqual(demoMetrics.document.clientHeight + 1);
  });

  test("[REG-UI-005] @ui @usability reaches required controls in all twelve views at minimum size", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    const profile = await applyWindowProfile(electronApp, page, "minimum", testInfo);
    for (const view of WORKBENCH_VIEWS) {
      await test.step(view, async () => {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertRequiredControls(page, VIEW_REQUIRED_CONTROLS[view]);
        const metrics = await collectLayoutMetrics({
          page,
          profile,
          theme: "bureau",
          state: "demo",
          required: VIEW_REQUIRED_CONTROLS[view],
          testInfo
        });
        expect(blockingLayoutViolations(metrics), `${view} layout violations`).toEqual([]);
        if (view === "intercept") {
          const queueHeight = await page.getByTestId("interceptQueue").evaluate((element) =>
            element.getBoundingClientRect().height
          );
          expect(queueHeight, "minimum Intercept queue height").toBeGreaterThanOrEqual(120);
        }
      });
    }
    await openIdentityLab(page);
    await assertRequiredControls(page, IDENTITY_REQUIRED_CONTROLS);
    const operator = await openAiFirstConsole(page);
    await applyWindowProfile(electronApp, operator, "minimum", testInfo);
    await assertAiOperatorControls(operator);
    await assertNoGlobalHorizontalOverflow(operator);
  });

  test("[REG-UI-006] @ui passes every view at laptop and default layouts", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const profileId of ["laptop", "default"] as const) {
      const profile = await applyWindowProfile(electronApp, page, profileId, testInfo);
      for (const view of WORKBENCH_VIEWS) {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertRequiredControls(page, VIEW_REQUIRED_CONTROLS[view]);
        await assertNoGlobalHorizontalOverflow(page);
        const metrics = await collectLayoutMetrics({
          page,
          profile,
          theme: "bureau",
          state: "demo",
          required: VIEW_REQUIRED_CONTROLS[view],
          testInfo
        });
        expect(blockingLayoutViolations(metrics), `${profileId}/${view}`).toEqual([]);
        if (view === "findings") {
          const ownershipWidths = await Promise.all([
            page.getByTestId("findingOwner").evaluate((element) => element.getBoundingClientRect().width),
            page.getByTestId("findingAssignee").evaluate((element) => element.getBoundingClientRect().width)
          ]);
          expect(Math.min(...ownershipWidths), `${profileId}/findings ownership fields`).toBeGreaterThanOrEqual(170);
        }
      }
    }

    const themeViews: WorkbenchView[] = ["traffic", "repeater", "automate", "findings", "workflows", "advanced", "scope", "ssl"];
    await applyWindowProfile(electronApp, page, "default", testInfo);
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      await assertRequiredControls(page, SHELL_CONTAINERS);
      for (const view of themeViews) {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertRequiredControls(page, VIEW_REQUIRED_CONTROLS[view].slice(0, 6));
        await assertNoGlobalHorizontalOverflow(page);
      }
      await openIdentityLab(page);
      await assertRequiredControls(page, IDENTITY_REQUIRED_CONTROLS);
      await page.getByTestId("toggleIdentityLab").click();
      await expect(page.getByTestId("advancedWorkbench")).toBeVisible();
    }
  });

  test("[REG-UI-007] @ui bounds evidence panels on wide and large windows", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await openWorkbenchView(page, "traffic");
    for (const profileId of ["wide", "large"] as const) {
      await applyWindowProfile(electronApp, page, profileId, testInfo);
      const widths = await page.evaluate(() => {
        const evidence = document.querySelector("[data-testid='trafficDetailText']")?.getBoundingClientRect();
        const workspace = document.querySelector("[data-testid='evidencePane']")?.getBoundingClientRect();
        return { evidence: evidence?.width || 0, workspace: workspace?.width || 0 };
      });
      expect(widths.evidence).toBeGreaterThan(280);
      expect(widths.evidence).toBeLessThanOrEqual(1500);
      expect(widths.workspace).toBeGreaterThan(widths.evidence);
      await assertNoGlobalHorizontalOverflow(page);
    }
  });

  test("[REG-UI-008] @ui @usability keeps critical workflows reachable at 125% and 150% zoom", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const profileId of ["zoom-125", "zoom-150"] as const) {
      await applyWindowProfile(electronApp, page, profileId, testInfo);
      for (const view of CRITICAL_ZOOM_VIEWS) {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertRequiredControls(page, VIEW_REQUIRED_CONTROLS[view].slice(0, 6));
        await assertNoGlobalHorizontalOverflow(page);
      }
      const operator = await openAiFirstConsole(page);
      await applyWindowProfile(electronApp, operator, profileId, testInfo);
      await assertAiOperatorControls(operator);
      await assertNoGlobalHorizontalOverflow(operator);
    }
  });

  test("[REG-UI-009] @ui @usability gives visible critical controls a name and usable target", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    const testIds = [
      "openBrowser",
      "openGlobalSearch",
      "openProjectArtifacts",
      "openAiPalette",
      "openProfileSessionPanel",
      "openAppearanceSettings",
      "openAiSettings",
      "cloneToRepeater"
    ];
    for (const testId of testIds) {
      const control = page.getByTestId(testId);
      await control.scrollIntoViewIfNeeded();
      const measurement = await control.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          name: element.getAttribute("aria-label") || element.getAttribute("title") || (element as HTMLElement).innerText
        };
      });
      expect(measurement.name?.trim(), testId).toBeTruthy();
      expect(measurement.width, testId).toBeGreaterThanOrEqual(32);
      expect(measurement.height, testId).toBeGreaterThanOrEqual(28);
    }
  });

  test("[REG-UI-010] @ui @usability prevents toolbar and primary-action overlap", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    for (const view of WORKBENCH_VIEWS) {
      await openWorkbenchView(page, view);
      const overlaps = await page.getByTestId("workbenchActionBar").evaluate((bar) => {
        const buttons = Array.from(bar.querySelectorAll("button")).filter((button) => {
          const rect = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
        });
        const collisions: string[] = [];
        for (let leftIndex = 0; leftIndex < buttons.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < buttons.length; rightIndex += 1) {
            const left = buttons[leftIndex].getBoundingClientRect();
            const right = buttons[rightIndex].getBoundingClientRect();
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            if (width > 1 && height > 1) collisions.push(`${buttons[leftIndex].innerText}/${buttons[rightIndex].innerText}`);
          }
        }
        return collisions;
      });
      expect(overlaps, view).toEqual([]);

      const formOverlaps = await findFormControlOverlaps(page);
      expect(formOverlaps, `${view} form controls`).toEqual([]);
    }

    await applyWindowProfile(electronApp, page, "default", testInfo);
    for (const view of WORKBENCH_VIEWS) {
      await openWorkbenchView(page, view);
      await prepareRequiredViewState(page, view);
      const formOverlaps = await findFormControlOverlaps(page);
      expect(formOverlaps, `${view} default form controls`).toEqual([]);
    }
  });

  test("[REG-UI-011] @ui @usability lets dense panels scroll to their final controls", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    const endings: Array<[WorkbenchView, string]> = [
      ["findings", "findingReportPreview"],
      ["workflows", "workflowResults"],
      ["plugins", "pluginAudit"],
      ["automate", "automateResultDetail"]
    ];
    for (const [view, testId] of endings) {
      await openWorkbenchView(page, view);
      const ending = page.getByTestId(testId);
      await ending.scrollIntoViewIfNeeded();
      await expect(ending, `${view} final content`).toBeVisible();
      const intersectsViewport = await ending.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
      });
      expect(intersectsViewport).toBe(true);
    }
  });

  test("[REG-UI-012] @ui @usability prevents undisclosed truncation on primary headings and actions", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    for (const view of WORKBENCH_VIEWS) {
      await openWorkbenchView(page, view);
      const failures = await page.getByTestId("workbenchActionBar").evaluate((bar) =>
        Array.from(bar.querySelectorAll<HTMLElement>("h1, h2, h3, button"))
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .filter((element) => !element.title && !element.getAttribute("aria-label"))
          .map((element) => element.innerText.trim())
      );
      expect(failures, view).toEqual([]);
    }

    await applyWindowProfile(electronApp, page, "default", testInfo);
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      const workspaceTitle = page.getByTestId("workspaceHeader").locator("h2");
      const clipped = await workspaceTitle.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      expect(clipped, `${theme} workspace title`).toBe(false);
    }
  });

  test("[REG-UI-013] @ui @usability keeps primary overlays within the viewport with internal scrolling", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    const overlays: Array<{ trigger: string; overlay: string; close: () => Promise<void> }> = [
      { trigger: "openGlobalSearch", overlay: "globalSearchOverlay", close: async () => page.getByTestId("closeGlobalSearch").click() },
      { trigger: "openProjectArtifacts", overlay: "projectArtifactsOverlay", close: async () => page.getByTestId("closeProjectArtifacts").click() },
      { trigger: "openAppearanceSettings", overlay: "appearanceSettingsPanel", close: async () => page.getByRole("button", { name: "Close appearance settings" }).click() },
      { trigger: "openProfileSessionPanel", overlay: "profileSessionPanel", close: async () => page.getByLabel("Close projects and sessions panel").click() }
    ];
    for (const profile of ["minimum", "zoom-125", "zoom-150"] as const) {
      await applyWindowProfile(electronApp, page, profile, testInfo);
      for (const entry of overlays) {
        await page.getByTestId(entry.trigger).click();
        const overlay = page.getByTestId(entry.overlay);
        await expect(overlay).toBeVisible();
        const fit = await overlay.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
            canScroll: element.scrollHeight <= element.clientHeight + 1 || /(auto|scroll)/.test(`${style.overflow}${style.overflowY}`) || Boolean(element.querySelector("[class*='overflow-y-auto'], [class*='overflow-auto']"))
          };
        });
        expect(fit.fits, `${profile}/${entry.overlay}`).toBe(true);
        expect(fit.canScroll, `${profile}/${entry.overlay}`).toBe(true);
        await entry.close();
      }
    }
  });

  test("[REG-UI-014] @ui @ai keeps the AI Operator resizable, scrollable, and independent of evidence", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    const evidenceWidth = await page.getByTestId("evidencePane").evaluate((element) => element.getBoundingClientRect().width);
    const operator = await openAiFirstConsole(page);
    await applyWindowProfile(electronApp, operator, "default", testInfo);
    const taskRail = operator.getByTestId("aiRunRail");
    await expect(taskRail).toBeVisible();
    if (await taskRail.getAttribute("data-collapsed") === "true") {
      await operator.getByTestId("expandAiRunRail").click();
    }
    await expect(taskRail).toHaveAttribute("data-collapsed", "false");
    await operator.getByTestId("toggleAiRunRail").click();
    await expect(taskRail).toHaveAttribute("data-collapsed", "true");
    const railFit = await operator.getByTestId("aiOperatorWorkspace").evaluate((workspace) => {
      const rail = workspace.querySelector<HTMLElement>("[data-testid='aiRunRail']");
      if (!rail) throw new Error("Task History rail is unavailable.");
      const workspaceRect = workspace.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      return {
        top: railRect.top,
        bottom: railRect.bottom,
        workspaceTop: workspaceRect.top,
        workspaceBottom: workspaceRect.bottom
      };
    });
    expect(railFit.top).toBeCloseTo(railFit.workspaceTop, 0);
    expect(railFit.bottom).toBeCloseTo(railFit.workspaceBottom, 0);
    await applyWindowProfile(electronApp, operator, "minimum", testInfo);
    await expect(operator.getByTestId("aiOperatorComposer")).toBeVisible();
    await operator.getByTestId("toggleAiInspector").click();
    await expect(operator.getByTestId("aiMissionInspector")).toBeVisible();
    await assertNoGlobalHorizontalOverflow(operator);
    await expect(page.getByTestId("evidencePane")).toBeVisible();
    expect(await page.getByTestId("evidencePane").evaluate((element) => element.getBoundingClientRect().width)).toBe(evidenceWidth);
    await assertNoGlobalHorizontalOverflow(page);
  });

  test("[REG-UI-018] @ui @usability keeps request and response evidence selectable, copyable, and internally scrollable", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    await openWorkbenchView(page, "traffic");
    await applyWindowProfile(electronApp, page, "zoom-150", testInfo);
    const evidence = page.getByTestId("trafficDetailText");
    const contract = await evidence.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        selectable: style.userSelect !== "none",
        internalOverflow: /(auto|scroll)/.test(`${style.overflow}${style.overflowX}${style.overflowY}`),
        text: element.textContent || "",
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight)
      };
    });
    expect(contract.selectable).toBe(true);
    expect(contract.internalOverflow).toBe(true);
    expect(contract.text.length).toBeGreaterThan(40);
    expect(contract.lineHeight / contract.fontSize).toBeGreaterThanOrEqual(1.35);
    await expect(page.getByTestId("copyTrafficDetail")).toBeVisible();
  });

  test("[REG-UI-019] @ui honors reduced motion without hiding status or controls", async ({ radarPage: page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await loadDemo(page);
    const motion = await page.evaluate(() => ({
      reveal: getComputedStyle(document.querySelector(".radar-reveal") as Element).animationName,
      shellVisible: getComputedStyle(document.querySelector("[data-testid='radarShell']") as Element).visibility,
      opacity: getComputedStyle(document.querySelector(".radar-reveal") as Element).opacity
    }));
    expect(motion.reveal).toBe("none");
    expect(motion.shellVisible).not.toBe("hidden");
    expect(Number(motion.opacity)).toBeGreaterThan(0);
    await expect(page.getByTestId("openGlobalSearch")).toBeVisible();
  });

  test("[REG-UI-025] @ui @visual @usability @ui-critical preserves clarity and hierarchy below 100% zoom", async ({ electronApp, radarPage: page }, testInfo) => {
    await loadDemo(page);
    for (const profileId of ["zoom-90", "zoom-80"] as const) {
      const profile = await applyWindowProfile(electronApp, page, profileId, testInfo);
      const views = profileId === "zoom-90" ? WORKBENCH_VIEWS : ["traffic", "intercept", "repeater", "automate", "findings", "workflows", "scope"] as const;
      for (const view of views) {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertNoGlobalHorizontalOverflow(page);
        const metrics = await collectLayoutMetrics({
          page,
          profile,
          theme: "bureau",
          state: "demo",
          required: VIEW_REQUIRED_CONTROLS[view].slice(0, 5),
          testInfo
        });
        expect(blockingLayoutViolations(metrics), `${profileId}/${view}`).toEqual([]);
      }
      const operator = await openAiFirstConsole(page);
      await applyWindowProfile(electronApp, operator, profileId, testInfo);
      await assertAiOperatorControls(operator);
      await assertNoGlobalHorizontalOverflow(operator);
      if (profileId === "zoom-80") {
        await operator.getByTestId("toggleAiInspector").click();
        await expect(operator.getByTestId("aiMissionInspector")).toBeVisible();
        const missionGraph = operator.getByTestId("agentMissionGraph");
        await expect(missionGraph).toBeVisible();
        const graphLayout = await missionGraph.evaluate((element) => {
          const coverage = element.querySelector<HTMLElement>("[data-testid='missionGraphCoverage']");
          return {
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            coverageClientWidth: coverage?.clientWidth || 0,
            coverageScrollWidth: coverage?.scrollWidth || 0
          };
        });
        expect(graphLayout.scrollWidth, "AI Operator Mission Graph should not overflow its inspector").toBeLessThanOrEqual(graphLayout.clientWidth + 1);
        expect(graphLayout.coverageScrollWidth, "Mission Graph coverage labels should remain inside their grid").toBeLessThanOrEqual(graphLayout.coverageClientWidth + 1);
        for (const [trigger, overlay, close] of [
          ["openProjectArtifacts", "projectArtifactsOverlay", "closeProjectArtifacts"],
          ["openGlobalSearch", "globalSearchOverlay", "closeGlobalSearch"]
        ] as const) {
          await page.getByTestId(trigger).click();
          await expect(page.getByTestId(overlay)).toBeVisible();
          await page.getByTestId(close).click();
        }
        await openWorkbenchView(page, "traffic");
        const effectiveEvidenceSize = await page.getByTestId("trafficDetailText").evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize) * 0.8);
        expect(effectiveEvidenceSize).toBeGreaterThanOrEqual(9.5);
      }
    }
  });

});
