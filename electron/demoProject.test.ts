import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAdvancedTestingSummary } from "../shared/advancedTesting.js";
import { DEMO_PROFILE_NAME, DEMO_SESSION_NAME, seedDemoProject } from "./demoProject.js";
import { openLocalStore } from "./localStore.js";

describe("demoProject", () => {
  let tmpDir = "";

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = "";
    }
  });

  function makeStore() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-demo-project-"));
    return openLocalStore(tmpDir);
  }

  it("seeds a dedicated demo project with walkthrough evidence", () => {
    const store = makeStore();
    const context = seedDemoProject(store);
    const targets = store.getTargets(context.workspace.id);
    const captures = store.listCaptures(context.session.id, 20);
    const frames = store.listWebSocketEvents(context.session.id, 20);
    const advanced = buildAdvancedTestingSummary(captures, frames, "", targets[0] || "");

    expect(context.profile.name).toBe(DEMO_PROFILE_NAME);
    expect(context.session.name).toBe(DEMO_SESSION_NAME);
    expect(targets).toEqual(expect.arrayContaining(["https://api.demo.radar.test", "http://localhost:3000"]));
    expect(captures).toHaveLength(4);
    expect(frames).toHaveLength(3);
    expect(store.listFindings(context.session.id)).toHaveLength(2);
    expect(store.listWorkflowDefinitions(context.workspace.id)).toHaveLength(1);
    expect(store.listWorkflowRuns(context.session.id)).toHaveLength(1);
    expect(store.listPlugins(context.workspace.id)).toEqual([
      expect.objectContaining({ id: "demo-evidence-panel", status: "approved" })
    ]);
    expect(store.listAgentRuns(context.session.id)).toEqual([
      expect.objectContaining({ id: "demo-agent-passive-map", status: "completed" })
    ]);
    expect(advanced.graphql.operationCount).toBeGreaterThan(0);
    expect(advanced.parameters.length).toBeGreaterThan(0);
    expect(advanced.secrets.length).toBeGreaterThan(0);
    expect(advanced.headerSignals.length).toBeGreaterThan(0);

    store.close();
  });

  it("refreshes the demo project without duplicate persisted records", () => {
    const store = makeStore();
    const first = seedDemoProject(store);
    const second = seedDemoProject(store);

    expect(second.profile.id).toBe(first.profile.id);
    expect(second.session.id).toBe(first.session.id);
    expect(store.listProfiles().filter((profile) => profile.name === DEMO_PROFILE_NAME)).toHaveLength(1);
    expect(store.listCaptures(second.session.id, 20)).toHaveLength(4);
    expect(store.listWebSocketEvents(second.session.id, 20)).toHaveLength(3);
    expect(store.listFindings(second.session.id)).toHaveLength(2);
    expect(store.listAgentRuns(second.session.id)).toHaveLength(1);

    store.close();
  });
});
