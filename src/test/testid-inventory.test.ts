import { describe, expect, it } from "vitest";
import inventoryText from "./testid-inventory.txt?raw";

const sourceModules = import.meta.glob(["../App.tsx", "../components/**/*.{ts,tsx}", "../ai/**/*.{ts,tsx}", "../ai-operator/**/*.{ts,tsx}", "../RendererBootstrapError.tsx"], {
  query: "?raw",
  import: "default",
  eager: true
}) as Record<string, string>;

function collectTestIdsFromSource(source: string): string[] {
  const matches = source.matchAll(/data-testid="([^"]+)"/g);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}

describe("testid inventory guard", () => {
  it("keeps the known data-testid set available across App and extracted components", () => {
    const expected = inventoryText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const ids = new Set<string>();
    for (const [path, source] of Object.entries(sourceModules)) {
      if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) {
        continue;
      }
      for (const id of collectTestIdsFromSource(source)) {
        ids.add(id);
      }
    }

    expect([...ids].sort()).toEqual(expected);
  });
});
