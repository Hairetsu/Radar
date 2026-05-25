import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { findSystemBrowser } from "./systemBrowser.js";

describe("systemBrowser", () => {
  it("finds an installed system browser on this machine", () => {
    const browser = findSystemBrowser();
    expect(browser.channel.length).toBeGreaterThan(0);
    expect(fs.existsSync(browser.executablePath)).toBe(true);
  });
});
