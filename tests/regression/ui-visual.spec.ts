import fs from "node:fs";
import path from "node:path";
import { expect, loadDemo, setScope, startProxy, test } from "./fixtures";
import { sendThroughRadarProxy } from "./target-lab";
import { setTheme, UI_THEMES } from "./ui/fontAudit";
import { assertNoGlobalHorizontalOverflow, assertRequiredControls } from "./ui/layoutAudit";
import { openAiFirstConsole, openIdentityLab, openWorkbenchView, prepareRequiredViewState, VIEW_REQUIRED_CONTROLS, WORKBENCH_VIEWS } from "./ui/uiStates";
import { attachActualVisual, expectVisualAnchor, stabilizeVisuals } from "./ui/visualStability";
import { applyWindowProfile, type WindowProfileId } from "./ui/windowProfiles";

const runFullUiMatrix = process.env.RADAR_REGRESSION_UI_FULL === "1";
const runHumanReviewGate = process.env.RADAR_UI_HUMAN_REVIEW === "1";
const criticalZoomViews = ["traffic", "intercept", "repeater", "automate", "findings", "workflows", "scope"] as const;

async function captureMatrixImage({
  page,
  theme,
  name,
  volatile,
  testInfo,
  dense = true
}: {
  page: Parameters<typeof stabilizeVisuals>[0];
  theme: Parameters<typeof stabilizeVisuals>[1];
  name: string;
  volatile: Parameters<typeof attachActualVisual>[0]["mask"];
  testInfo: Parameters<typeof attachActualVisual>[0]["testInfo"];
  dense?: boolean;
}) {
  await stabilizeVisuals(page, theme);
  await attachActualVisual({ page, name, mask: volatile, testInfo });
  if (process.platform === "linux") {
    await expectVisualAnchor({ page, name, mask: volatile, dense, testInfo });
  }
}

async function capturePrimaryOverlays({
  electronApp,
  page,
  profile,
  volatile,
  testInfo
}: {
  electronApp: Parameters<typeof applyWindowProfile>[0];
  page: Parameters<typeof applyWindowProfile>[1];
  profile: WindowProfileId;
  volatile: Parameters<typeof attachActualVisual>[0]["mask"];
  testInfo: Parameters<typeof attachActualVisual>[0]["testInfo"];
}) {
  await applyWindowProfile(electronApp, page, profile, testInfo);
  const overlays = [
    { id: "project-artifacts", trigger: "openProjectArtifacts", close: "closeProjectArtifacts" },
    { id: "global-search", trigger: "openGlobalSearch", close: "closeGlobalSearch" },
    { id: "appearance", trigger: "openAppearanceSettings", closeLabel: "Close appearance settings" },
    { id: "ai-settings", trigger: "openAiSettings", close: "aiSettingsClose" },
    { id: "projects-sessions", trigger: "openProfileSessionPanel", closeLabel: "Close projects and sessions panel" }
  ] as const;
  for (const overlay of overlays) {
    await page.getByTestId(overlay.trigger).click();
    await captureMatrixImage({
      page,
      theme: "bureau",
      name: `full-overlay-${overlay.id}-bureau-${profile}-demo`,
      volatile,
      testInfo,
      dense: false
    });
    if ("close" in overlay) {
      await page.getByTestId(overlay.close).click();
    } else {
      await page.getByLabel(overlay.closeLabel).click();
    }
  }

  await openAiFirstConsole(page);
  await captureMatrixImage({
    page,
    theme: "bureau",
    name: `full-ai-first-bureau-${profile}-demo`,
    volatile,
    testInfo
  });
  await page.getByTestId("manualFirstMode").click();
}

test.describe("UI visual baselines and release review", () => {
  test.describe.configure({ timeout: 1_800_000 });

  test("[REG-UI-020] @ui @visual @ui-critical matches approved Linux visual anchors", async ({ electronApp, radarPage: page }, testInfo) => {
    test.skip(process.platform !== "linux", "Linux is the canonical pixel-baseline platform.");
    await loadDemo(page);
    const volatile = [page.getByTestId("workspaceUtcClock"), page.getByTestId("telemetryUtcClock")];

    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      await applyWindowProfile(electronApp, page, "default", testInfo);
      await openWorkbenchView(page, "traffic");
      await stabilizeVisuals(page, theme);
      await expectVisualAnchor({ page, name: `traffic-${theme}-default-demo`, mask: volatile, dense: true, testInfo });
    }

    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      await applyWindowProfile(electronApp, page, "zoom-90", testInfo);
      await openWorkbenchView(page, "traffic");
      await stabilizeVisuals(page, theme);
      await expectVisualAnchor({ page, name: `traffic-${theme}-zoom-90-demo`, mask: volatile, dense: true, testInfo });
    }

    await setTheme(page, "bureau", testInfo);
    const anchors = [
      { view: "automate", profile: "minimum", name: "automate-bureau-minimum-demo" },
      { view: "findings", profile: "minimum", name: "findings-bureau-minimum-demo" },
      { view: "workflows", profile: "laptop", name: "workflows-bureau-laptop-demo" },
      { view: "traffic", profile: "zoom-150", name: "traffic-bureau-zoom-150-evidence" },
      { view: "intercept", profile: "zoom-80", name: "intercept-bureau-zoom-80-demo" },
      { view: "findings", profile: "zoom-80", name: "findings-bureau-zoom-80-demo" }
    ] as const;
    for (const anchor of anchors) {
      await applyWindowProfile(electronApp, page, anchor.profile, testInfo);
      await openWorkbenchView(page, anchor.view);
      await stabilizeVisuals(page, "bureau");
      await expectVisualAnchor({ page, name: anchor.name, mask: volatile, dense: true, testInfo });
    }

    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    await page.getByTestId("openProjectArtifacts").click();
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "project-artifacts-bureau-minimum-demo", mask: volatile, testInfo });
    await page.getByTestId("closeProjectArtifacts").click();

    await applyWindowProfile(electronApp, page, "zoom-125", testInfo);
    await page.getByTestId("openGlobalSearch").click();
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "global-search-bureau-zoom-125-demo", mask: volatile, testInfo });
    await page.getByTestId("closeGlobalSearch").click();

    await openAiFirstConsole(page);
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "ai-first-bureau-zoom-125-demo", mask: volatile, dense: true, testInfo });
    await page.getByTestId("manualFirstMode").click();

    await applyWindowProfile(electronApp, page, "minimum", testInfo);
    await openAiFirstConsole(page);
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "ai-first-bureau-minimum-demo", mask: volatile, dense: true, testInfo });
    await page.getByTestId("manualFirstMode").click();

    await applyWindowProfile(electronApp, page, "zoom-80", testInfo);
    await openAiFirstConsole(page);
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "ai-first-bureau-zoom-80-demo", mask: volatile, dense: true, testInfo });
    await page.getByTestId("manualFirstMode").click();

    await applyWindowProfile(electronApp, page, "default", testInfo);
    await openIdentityLab(page);
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "identity-bureau-default-demo", mask: volatile, dense: true, testInfo });

    await page.getByTestId("openAppearanceSettings").click();
    await stabilizeVisuals(page, "bureau");
    await expectVisualAnchor({ page, name: "appearance-bureau-default", mask: volatile, testInfo });
  });

  test("[REG-UI-021] @ui @visual @ui-full captures the full view, theme, and window matrix", async ({ electronApp, radarPage: page, targetLab, proxyPort }, testInfo) => {
    test.skip(!runFullUiMatrix, "Set RADAR_REGRESSION_UI_FULL=1 for the scheduled full UI matrix.");
    await loadDemo(page);
    const volatile = [page.getByTestId("workspaceUtcClock"), page.getByTestId("telemetryUtcClock")];
    for (const theme of UI_THEMES) {
      await setTheme(page, theme, testInfo);
      for (const profile of ["minimum", "default", "wide"] as const) {
        await applyWindowProfile(electronApp, page, profile, testInfo);
        for (const view of WORKBENCH_VIEWS) {
          await openWorkbenchView(page, view);
          const name = `full-${view}-${theme}-${profile}-demo`;
          await captureMatrixImage({ page, theme, name, volatile, testInfo });
        }
      }
    }

    await setTheme(page, "bureau", testInfo);
    await setScope(page, ["https://api.demo.radar.test", targetLab.origin]);
    await startProxy(page, proxyPort);
    await Promise.all(Array.from({ length: 36 }, (_, index) =>
      sendThroughRadarProxy(proxyPort, `${targetLab.origin}/api/status/${200 + (index % 5)}?dense=${index}`)
    ));
    await openWorkbenchView(page, "traffic");
    await expect.poll(() => page.locator("[data-testid^='trafficRow-']").count()).toBeGreaterThanOrEqual(36);
    for (const profile of ["wide", "large"] as const) {
      await applyWindowProfile(electronApp, page, profile, testInfo);
      for (const view of WORKBENCH_VIEWS) {
        await openWorkbenchView(page, view);
        await captureMatrixImage({
          page,
          theme: "bureau",
          name: `full-${view}-bureau-${profile}-dense`,
          volatile,
          testInfo
        });
      }
    }

    for (const profile of ["minimum", "zoom-125", "zoom-150"] as const) {
      await capturePrimaryOverlays({ electronApp, page, profile, volatile, testInfo });
    }

    for (const view of WORKBENCH_VIEWS) {
      await applyWindowProfile(electronApp, page, "zoom-90", testInfo);
      await openWorkbenchView(page, view);
      await prepareRequiredViewState(page, view);
      await captureMatrixImage({ page, theme: "bureau", name: `full-${view}-bureau-zoom-90-dense`, volatile, testInfo });
    }

    for (const profile of ["zoom-80", "zoom-75", "zoom-200"] as const) {
      await applyWindowProfile(electronApp, page, profile, testInfo);
      for (const view of criticalZoomViews) {
        await openWorkbenchView(page, view);
        await prepareRequiredViewState(page, view);
        await assertRequiredControls(page, VIEW_REQUIRED_CONTROLS[view].slice(0, 5));
        await assertNoGlobalHorizontalOverflow(page);
        await captureMatrixImage({
          page,
          theme: "bureau",
          name: `full-${view}-bureau-${profile}-dense`,
          volatile,
          testInfo
        });
      }
    }
  });

  test("[REG-UI-024] @ui @usability validates the recorded human release review", async () => {
    test.skip(!runHumanReviewGate, "Set RADAR_UI_HUMAN_REVIEW=1 after completing the release-candidate review.");
    const reviewPath = path.resolve(process.env.RADAR_UI_HUMAN_REVIEW_FILE || "docs/UI_USABILITY_REVIEW.md");
    const review = fs.readFileSync(reviewPath, "utf8");
    expect(review).not.toContain("TBD");
    expect(review).not.toContain("- [ ]");
    for (const field of ["Reviewer:", "Date:", "Commit:", "OS:", "Display:", "Scale factor:"]) {
      expect(review, field).toContain(field);
    }
    expect(review).toContain("Decision: PASS");
  });
});
