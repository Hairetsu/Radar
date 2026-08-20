import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registeredSpecCatalog } from "./regression-reporter";

const tempDirectories: string[] = [];

function createFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "radar-regression-catalog-"));
  tempDirectories.push(root);
  const regressionDirectory = path.join(root, "tests", "regression");
  fs.mkdirSync(regressionDirectory, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    fs.writeFileSync(path.join(regressionDirectory, name), source, "utf8");
  }
  return root;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("registeredSpecCatalog", () => {
  it("keeps the repository's stable IDs unique", () => {
    const catalog = registeredSpecCatalog(process.cwd());

    expect(catalog.ids.length).toBeGreaterThan(0);
    expect(catalog.duplicateIds).toEqual([]);
  });

  it("uses executable spec files as the stable-ID catalog", () => {
    const root = createFixture({
      "alpha.spec.ts": 'test("REG-APP-002 works", () => {});\ntest("REG-APP-001 works", () => {});',
      "beta.spec.ts": 'test("REG-UI-001 works", () => {});',
      "notes.txt": "REG-NOTE-001"
    });

    expect(registeredSpecCatalog(root)).toEqual({
      ids: ["REG-APP-001", "REG-APP-002", "REG-UI-001"],
      duplicateIds: []
    });
  });

  it("reports duplicate IDs across executable specs", () => {
    const root = createFixture({
      "alpha.spec.ts": 'test("REG-APP-001 first", () => {});',
      "beta.spec.ts": 'test("REG-APP-001 second", () => {});'
    });

    expect(registeredSpecCatalog(root).duplicateIds).toEqual(["REG-APP-001"]);
  });

  it("does not treat repeated references within one spec as duplicate registrations", () => {
    const root = createFixture({
      "alpha.spec.ts": 'test("REG-APP-001 works", () => { expect("REG-APP-001").toBeTruthy(); });'
    });

    expect(registeredSpecCatalog(root).duplicateIds).toEqual([]);
  });
});
