import fs from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from "@playwright/test/reporter";

type Outcome = "passed" | "failed" | "flaky" | "skipped";

type ResultCounts = Record<Outcome, number>;

type PriorSummary = {
  tests?: Array<{ id?: string; outcome?: Outcome }>;
};

const EMPTY_COUNTS: ResultCounts = { passed: 0, failed: 0, flaky: 0, skipped: 0 };

const PRODUCT_VIEWS: Record<string, string> = {
  ADV: "Advanced Testing",
  AIF: "AI-First",
  AIM: "AI Manual-First",
  APP: "Application Shell",
  AUTO: "Automate",
  DATA: "Data & Persistence",
  FILE: "Files & Reports",
  FIND: "Findings",
  HTTP: "HTTP/S Traffic",
  ID: "Identity Lab",
  INT: "Intercept",
  MAP: "Sitemap",
  PLUG: "Plugins",
  PROJ: "Projects & Sessions",
  REP: "Repeater",
  RES: "Resilience",
  SCOPE: "Scope",
  SSL: "SSL & Proxy",
  UI: "UI, Typography & Usability",
  WF: "Workflows",
  WS: "WebSocket"
};

function seconds(milliseconds: number) {
  return `${(milliseconds / 1_000).toFixed(1)}s`;
}

function escaped(value: string) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function stableId(test: TestCase) {
  return test.title.match(/REG-[A-Z]+-\d{3}/)?.[0] || "UNTRACKED";
}

function outcomeFor(test: TestCase): Outcome {
  const outcome = test.outcome();
  if (outcome === "unexpected") return "failed";
  if (outcome === "flaky") return "flaky";
  if (outcome === "skipped") return "skipped";
  return "passed";
}

function durationFor(test: TestCase) {
  return test.results.reduce((total, result) => total + result.duration, 0);
}

function increment(counts: ResultCounts, outcome: Outcome) {
  counts[outcome] += 1;
}

function countTests(tests: TestCase[]) {
  const counts = { ...EMPTY_COUNTS };
  for (const test of tests) increment(counts, outcomeFor(test));
  return counts;
}

function groupTests(tests: TestCase[], keyFor: (test: TestCase) => string[]) {
  const grouped = new Map<string, TestCase[]>();
  for (const test of tests) {
    for (const key of keyFor(test)) grouped.set(key, [...(grouped.get(key) || []), test]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function matrixRows(groups: Array<[string, TestCase[]]>) {
  return groups.map(([name, tests]) => {
    const counts = countTests(tests);
    return `| ${escaped(name)} | ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} | ${tests.length} |`;
  });
}

function registeredSpecIds(root: string) {
  const regressionDirectory = path.join(root, "tests", "regression");
  return new Set(
    fs
      .readdirSync(regressionDirectory)
      .filter((name) => name.endsWith(".spec.ts"))
      .flatMap((name) => [
        ...fs.readFileSync(path.join(regressionDirectory, name), "utf8").matchAll(/REG-[A-Z]+-\d{3}/g)
      ].map((match) => match[0]))
  );
}

function artifactLinks(test: TestCase, reportDirectory: string) {
  const attachments = test.results.flatMap((result) => result.attachments).filter((attachment) => attachment.path);
  const seen = new Set<string>();
  return attachments
    .filter((attachment) => {
      const key = `${attachment.name}:${attachment.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((attachment) => {
      const relativePath = path.relative(reportDirectory, attachment.path || "").replaceAll(path.sep, "/");
      return `[${escaped(attachment.name)}](<${relativePath}>)`;
    })
    .join(" · ");
}

function startupFor(test: TestCase) {
  const value = Number(test.annotations.find((annotation) => annotation.type === "radar-startup-ms")?.description || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] || 0;
}

function annotationValues(test: TestCase, type: string) {
  return [...new Set(test.annotations
    .filter((annotation) => annotation.type === type)
    .map((annotation) => annotation.description || "")
    .filter(Boolean))];
}

function uiEnvironment(test: TestCase) {
  const parts = [
    ["theme", annotationValues(test, "ui-theme")],
    ["profile", annotationValues(test, "ui-profile")],
    ["zoom", annotationValues(test, "ui-zoom")],
    ["state", annotationValues(test, "ui-state")]
  ] as const;
  const rendered = parts
    .filter(([, values]) => values.length > 0)
    .map(([label, values]) => `${label}: ${values.join(", ")}`);
  return rendered.length > 0 ? rendered.join(" · ") : "native/default";
}

function parsedJsonAttachments(tests: TestCase[], prefix: string) {
  const parsed: unknown[] = [];
  for (const test of tests) {
    for (const attachment of test.results.flatMap((result) => result.attachments)) {
      if (!attachment.name.startsWith(prefix)) continue;
      try {
        const contents = attachment.path
          ? fs.readFileSync(attachment.path, "utf8")
          : attachment.body?.toString("utf8");
        if (contents) parsed.push(JSON.parse(contents) as unknown);
      } catch {
        // The normal Playwright attachment remains available when aggregation fails.
      }
    }
  }
  return parsed;
}

function copyVisualAttachments(tests: TestCase[], outputDir: string) {
  const visualDir = path.join(outputDir, "visual");
  for (const kind of ["expected", "actual", "diff"] as const) {
    fs.mkdirSync(path.join(visualDir, kind), { recursive: true });
  }
  for (const test of tests) {
    for (const attachment of test.results.flatMap((result) => result.attachments)) {
      const name = attachment.name.toLowerCase();
      const kind = name.includes("expected") ? "expected" : name.includes("diff") ? "diff" : name.includes("actual") || name.endsWith(".png") ? "actual" : null;
      if (!kind) continue;
      const attachmentFileName = attachment.path
        ? path.basename(attachment.path)
        : attachment.name.replaceAll(/[^a-z0-9._-]+/gi, "-");
      const fileName = `${stableId(test)}-${attachmentFileName}`;
      try {
        const destination = path.join(visualDir, kind, fileName);
        if (attachment.path) {
          fs.copyFileSync(attachment.path, destination);
        } else if (attachment.body) {
          fs.writeFileSync(destination, attachment.body);
        }
      } catch {
        // The source attachment remains linked from the primary report.
      }
    }
  }
}

export default class RegressionReporter implements Reporter {
  private config: FullConfig | undefined;
  private suite: Suite | undefined;

  onBegin(config: FullConfig, suite: Suite) {
    this.config = config;
    this.suite = suite;
  }

  onEnd(result: FullResult) {
    const tests = this.suite?.allTests() || [];
    const outputDir = path.join(process.cwd(), "artifacts", "regression");
    fs.mkdirSync(outputDir, { recursive: true });
    const summaryPath = path.join(outputDir, "summary.json");
    let priorSummary: PriorSummary | null = null;
    try {
      priorSummary = JSON.parse(fs.readFileSync(summaryPath, "utf8")) as PriorSummary;
    } catch {
      priorSummary = null;
    }
    fs.writeFileSync(path.join(outputDir, "summary.md"), this.render(result, tests, outputDir, priorSummary));
    fs.writeFileSync(
      summaryPath,
      `${JSON.stringify(this.structuredSummary(result, tests), null, 2)}\n`
    );
    this.writeUiSummary(result, tests, outputDir);
  }

  private writeUiSummary(result: FullResult, tests: TestCase[], outputDir: string) {
    const uiTests = tests.filter((test) => test.title.includes("@ui"));
    if (uiTests.length === 0) return;
    const blockers = uiTests.filter((test) =>
      ["failed", "flaky"].includes(outcomeFor(test)) &&
      ["@ui-critical", "@font", "@usability"].some((tag) => test.title.includes(tag))
    );
    const fontAudits = parsedJsonAttachments(uiTests, "font-audit-");
    const layoutMetrics = parsedJsonAttachments(uiTests, "layout-metrics-");
    const environments = groupTests(uiTests, (test) => [uiEnvironment(test)]);
    const structured = {
      generatedAt: new Date().toISOString(),
      status: result.status,
      platform: process.platform,
      counts: countTests(uiTests),
      blockers: blockers.map((test) => ({ id: stableId(test), outcome: outcomeFor(test), title: test.title })),
      fullMatrixSelected: process.env.RADAR_REGRESSION_UI_FULL === "1",
      platformMatrixSelected: process.env.RADAR_REGRESSION_PLATFORM === "1",
      humanReviewSelected: process.env.RADAR_UI_HUMAN_REVIEW === "1",
      environments: environments.map(([name, grouped]) => ({ name, counts: countTests(grouped) })),
      fontAuditCount: fontAudits.length,
      layoutMetricCount: layoutMetrics.length
    };
    fs.writeFileSync(path.join(outputDir, "ui-summary.json"), `${JSON.stringify(structured, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "font-audit.json"), `${JSON.stringify(fontAudits, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "layout-metrics.json"), `${JSON.stringify(layoutMetrics, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "ui-summary.md"), [
      "# Radar UI Regression Summary",
      "",
      `Generated: ${structured.generatedAt}`,
      `Platform: ${structured.platform}`,
      `Result: **${result.status.toUpperCase()}**`,
      `Blocking UI results: **${blockers.length}**`,
      `Full matrix: ${structured.fullMatrixSelected ? "selected" : "skipped"}`,
      `Cross-platform matrix: ${structured.platformMatrixSelected ? "selected" : "skipped"}`,
      `Human review gate: ${structured.humanReviewSelected ? "selected" : "skipped"}`,
      "",
      "## UI Environments",
      "",
      "| Environment | Passed | Failed | Flaky | Skipped | Total |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...matrixRows(environments),
      "",
      "## Release Blockers",
      "",
      blockers.length === 0 ? "None." : blockers.map((test) => `- **${stableId(test)}** ${escaped(test.title)}`).join("\n"),
      "",
      "## Evidence",
      "",
      `- Font audits: ${fontAudits.length}`,
      `- Layout metric records: ${layoutMetrics.length}`,
      "- Visual expected/actual/diff artifacts: `visual/`",
      ""
    ].join("\n"));
    if (process.env.RADAR_UI_HUMAN_REVIEW === "1") {
      const reviewPath = path.resolve(process.env.RADAR_UI_HUMAN_REVIEW_FILE || "docs/UI_USABILITY_REVIEW.md");
      try {
        fs.copyFileSync(reviewPath, path.join(outputDir, "usability-review.md"));
      } catch {
        // REG-UI-024 reports a missing or invalid review record directly.
      }
    }
    copyVisualAttachments(uiTests, outputDir);
  }

  private structuredSummary(result: FullResult, tests: TestCase[]) {
    const uiBlockers = tests.filter((test) =>
      test.title.includes("@ui") &&
      ["failed", "flaky"].includes(outcomeFor(test)) &&
      ["@ui-critical", "@font", "@usability"].some((tag) => test.title.includes(tag))
    );
    return {
      generatedAt: new Date().toISOString(),
      status: result.status,
      wallTimeMs: result.duration,
      workers: this.config?.workers || 1,
      counts: countTests(tests),
      ui: {
        fullMatrixSelected: process.env.RADAR_REGRESSION_UI_FULL === "1",
        platformMatrixSelected: process.env.RADAR_REGRESSION_PLATFORM === "1",
        humanReviewSelected: process.env.RADAR_UI_HUMAN_REVIEW === "1",
        blockerIds: uiBlockers.map(stableId)
      },
      tests: tests.map((test) => ({
        id: stableId(test),
        title: test.title,
        outcome: outcomeFor(test),
        durationMs: durationFor(test),
        attempts: test.results.length,
        startupMs: startupFor(test) || undefined,
        uiTheme: annotationValues(test, "ui-theme"),
        uiProfile: annotationValues(test, "ui-profile"),
        uiZoom: annotationValues(test, "ui-zoom"),
        uiState: annotationValues(test, "ui-state"),
        uiDimensions: annotationValues(test, "ui-dimensions"),
        tags: [...test.title.matchAll(/@[a-z0-9-]+/gi)].map((match) => match[0]),
        file: path.relative(process.cwd(), test.location.file)
      }))
    };
  }

  private render(result: FullResult, tests: TestCase[], outputDir: string, priorSummary: PriorSummary | null) {
    const counts = countTests(tests);
    const root = process.cwd();
    const specification = fs.readFileSync(path.join(root, "docs", "REGRESSION_SUITE_SPEC.md"), "utf8");
    const catalogIds = [...new Set([...specification.matchAll(/^\| `(REG-[A-Z]+-\d{3})`/gm)].map((match) => match[1]))];
    const registeredIds = registeredSpecIds(root);
    const selectedIds = new Set(tests.map(stableId).filter((id) => id !== "UNTRACKED"));
    const missingIds = catalogIds.filter((id) => !registeredIds.has(id));
    const unregisteredIds = [...registeredIds].filter((id) => !catalogIds.includes(id)).sort();
    const skippedTests = tests.filter((test) => outcomeFor(test) === "skipped");
    const securityBlockers = tests.filter(
      (test) => test.title.includes("@security") && ["failed", "flaky"].includes(outcomeFor(test))
    );
    const uiBlockers = tests.filter((test) =>
      test.title.includes("@ui") &&
      ["failed", "flaky"].includes(outcomeFor(test)) &&
      ["@ui-critical", "@font", "@usability"].some((tag) => test.title.includes(tag))
    );
    const failures = tests.filter((test) => outcomeFor(test) === "failed");
    const slowest = [...tests]
      .filter((test) => outcomeFor(test) !== "skipped")
      .sort((left, right) => durationFor(right) - durationFor(left))
      .slice(0, 10);
    const tagGroups = groupTests(tests, (test) => [
      ...new Set([...test.title.matchAll(/@[a-z0-9-]+/gi)].map((match) => match[0].toLowerCase()))
    ]);
    const viewGroups = groupTests(tests, (test) => {
      const prefix = stableId(test).match(/^REG-([A-Z]+)-/)?.[1] || "OTHER";
      return [PRODUCT_VIEWS[prefix] || prefix];
    });
    const uiTests = tests.filter((test) => test.title.includes("@ui"));
    const uiEnvironmentGroups = groupTests(uiTests, (test) => [uiEnvironment(test)]);
    const aggregateDuration = tests.reduce((total, test) => total + durationFor(test), 0);
    const startupValues = tests.map(startupFor).filter((value) => value > 0);
    const priorOutcomes = new Map((priorSummary?.tests || []).map((test) => [test.id || "", test.outcome]));
    const newlyFailing = tests.filter((test) => {
      const previous = priorOutcomes.get(stableId(test));
      return outcomeFor(test) === "failed" && previous !== "failed";
    });
    const newlyFixed = tests.filter((test) => {
      const previous = priorOutcomes.get(stableId(test));
      return outcomeFor(test) === "passed" && (previous === "failed" || previous === "flaky");
    });
    const slowCount = tests.filter((test) => durationFor(test) >= 10_000).length;
    const recommendations = [
      counts.failed > 0
        ? `${counts.failed} failing workflow(s) need investigation before release.`
        : "No blocking workflow failures were detected.",
      counts.flaky > 0
        ? `${counts.flaky} flaky workflow(s) should be stabilized; inspect retained traces.`
        : "No flaky workflows were detected.",
      skippedTests.length > 0
        ? `${skippedTests.length} selected workflow(s) were skipped and remain explicit coverage gaps for this run.`
        : "No selected workflows were skipped.",
      slowCount > 0
        ? `${slowCount} workflow(s) exceeded 10 seconds; review the slowest-workflow table for startup, polling, or IPC latency.`
        : "No workflow crossed the 10-second slow-test threshold.",
      securityBlockers.length > 0
        ? `${securityBlockers.length} security-tagged failure or flaky result(s) block release.`
        : "No security-tagged release blockers were detected.",
      uiBlockers.length > 0
        ? `${uiBlockers.length} critical font/usability result(s) block release.`
        : "No critical UI/font/usability release blockers were detected.",
      process.env.RADAR_REGRESSION_UI_FULL === "1"
        ? "The full UI matrix was selected."
        : "The scheduled full UI matrix was not selected for this invocation.",
      process.env.RADAR_REGRESSION_PLATFORM === "1"
        ? "The installed-browser platform matrix was selected."
        : "The installed-browser platform matrix was not selected for this invocation."
    ];

    return [
      "# Radar Regression Report",
      "",
      `Generated: ${new Date().toISOString()}`,
      `Overall result: **${result.status.toUpperCase()}**`,
      `Workers: ${this.config?.workers || 1}`,
      `Wall time: ${seconds(result.duration)}`,
      `Aggregate workflow time: ${seconds(aggregateDuration)}`,
      "",
      "## Outcome",
      "",
      "| Passed | Failed | Flaky | Skipped | Selected |",
      "| ---: | ---: | ---: | ---: | ---: |",
      `| ${counts.passed} | ${counts.failed} | ${counts.flaky} | ${counts.skipped} | ${tests.length} |`,
      "",
      "## Release Signals",
      "",
      ...recommendations.map((item) => `- ${item}`),
      `- Catalog automation: ${registeredIds.size}/${catalogIds.length} stable IDs (${catalogIds.length ? ((registeredIds.size / catalogIds.length) * 100).toFixed(1) : "0.0"}%).`,
      `- This invocation selected ${selectedIds.size}/${catalogIds.length} catalog IDs.`,
      "",
      "## Results By Tag",
      "",
      "| Tag | Passed | Failed | Flaky | Skipped | Total |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...matrixRows(tagGroups),
      "",
      "## Results By Product Surface",
      "",
      "| Surface | Passed | Failed | Flaky | Skipped | Total |",
      "| --- | ---: | ---: | ---: | ---: | ---: |",
      ...matrixRows(viewGroups),
      ...(uiTests.length > 0 ? [
        "",
        "## Results By UI Environment",
        "",
        "| Environment | Passed | Failed | Flaky | Skipped | Total |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        ...matrixRows(uiEnvironmentGroups)
      ] : []),
      "",
      "## Changes From Prior Local Report",
      "",
      priorSummary
        ? [
            newlyFailing.length ? `Newly failing: ${newlyFailing.map(stableId).join(", ")}.` : "No newly failing selected IDs.",
            newlyFixed.length ? `Newly fixed: ${newlyFixed.map(stableId).join(", ")}.` : "No newly fixed selected IDs."
          ].join("\n\n")
        : "No prior `summary.json` was available for comparison.",
      "",
      "## Security Release Blockers",
      "",
      securityBlockers.length === 0
        ? "None."
        : securityBlockers.map((test) => `- **${stableId(test)}** ${escaped(test.title)} — ${outcomeFor(test)}`).join("\n"),
      "",
      "## UI, Font, And Usability Release Blockers",
      "",
      uiBlockers.length === 0
        ? "None."
        : uiBlockers.map((test) => `- **${stableId(test)}** ${escaped(test.title)} — ${outcomeFor(test)}`).join("\n"),
      "",
      "## Failures And Artifacts",
      "",
      failures.length === 0
        ? "No failed workflows."
        : [
            "| Workflow | Duration | Attempts | Evidence |",
            "| --- | ---: | ---: | --- |",
            ...failures.map((test) =>
              `| **${stableId(test)}** ${escaped(test.title)} | ${seconds(durationFor(test))} | ${test.results.length} | ${artifactLinks(test, outputDir) || "See HTML report"} |`
            )
          ].join("\n"),
      "",
      "## Slowest Workflows",
      "",
      "| Rank | Workflow | Outcome | Duration | Attempts |",
      "| ---: | --- | --- | ---: | ---: |",
      ...slowest.map((test, index) =>
        `| ${index + 1} | **${stableId(test)}** ${escaped(test.title)} | ${outcomeFor(test)} | ${seconds(durationFor(test))} | ${test.results.length} |`
      ),
      "",
      "## Application Startup Distribution",
      "",
      startupValues.length === 0
        ? "No standard fixture startup samples were recorded in this invocation."
        : `Samples: ${startupValues.length} · min ${seconds(Math.min(...startupValues))} · median ${seconds(percentile(startupValues, 0.5))} · p95 ${seconds(percentile(startupValues, 0.95))} · max ${seconds(Math.max(...startupValues))}.`,
      "",
      "## Skipped Coverage Gaps",
      "",
      skippedTests.length === 0
        ? "No selected catalog cases were skipped."
        : skippedTests.map((test) => `- **${stableId(test)}** ${escaped(test.title)}`).join("\n"),
      "",
      "## Catalog Coverage",
      "",
      missingIds.length === 0
        ? `All ${catalogIds.length} specified catalog cases have executable Playwright registrations.`
        : `${missingIds.length} catalog case(s) are not registered:\n\n${missingIds.map((id) => `- \`${id}\``).join("\n")}`,
      unregisteredIds.length === 0
        ? "No registered test IDs fall outside the specification."
        : `Registered IDs not found in the specification:\n\n${unregisteredIds.map((id) => `- \`${id}\``).join("\n")}`,
      "",
      "## Artifact Guide",
      "",
      "- [`html/index.html`](html/index.html): interactive report with steps and attachments.",
      "- [`results.json`](results.json): complete Playwright machine-readable output.",
      "- [`summary.json`](summary.json): compact status, tag, duration, and stable-ID data for CI ingestion.",
      "- [`ui-summary.md`](ui-summary.md) and [`ui-summary.json`](ui-summary.json): UI environment coverage, gates, and blockers.",
      "- [`font-audit.json`](font-audit.json) and [`layout-metrics.json`](layout-metrics.json): aggregated typography and geometry evidence.",
      "- `visual/`: copied expected, actual, and diff evidence when Playwright emits it.",
      "- `results/`: retained screenshots, traces, videos, and error context for failures.",
      "",
      "## Tested Architecture",
      "",
      "Each test launches a real Electron main process and renderer with an isolated user-data directory, SQLite store, proxy port, browser-debug port, and cleanup lifecycle. Playwright workers therefore run separate Radar use cases concurrently without sharing project evidence or browser profiles. Suite-owned loopback HTTP/S, WebSocket, deterministic AI, and file fixtures exercise real IPC and persistence boundaries without transmitting to external targets.",
      ""
    ].join("\n");
  }
}
