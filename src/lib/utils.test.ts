import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("keeps a custom type-scale size alongside a colour", () => {
    // Regression: tailwind-merge treated `text-meta` as a colour and dropped it
    // whenever a real colour was merged in, silently falling back to inherited
    // font sizes across the workbench.
    const merged = cn("font-mono text-meta text-muted");
    expect(merged).toContain("text-meta");
    expect(merged).toContain("text-muted");
  });

  it("keeps a custom tracking step alongside a size and colour", () => {
    const merged = cn("text-label tracking-label text-signal");
    expect(merged).toContain("text-label");
    expect(merged).toContain("tracking-label");
    expect(merged).toContain("text-signal");
  });

  it("still resolves conflicts within each scale", () => {
    expect(cn("text-meta", "text-label")).toBe("text-label");
    expect(cn("tracking-label", "tracking-data")).toBe("tracking-data");
    expect(cn("text-muted", "text-bone")).toBe("text-bone");
  });

  it("still resolves arbitrary sizes against scale steps", () => {
    expect(cn("text-meta", "text-[13px]")).toBe("text-[13px]");
  });
});
