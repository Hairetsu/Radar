import { describe, expect, it } from "vitest";
import { normalizeSavedFilter, normalizeSavedFilters } from "./savedFilters.js";

describe("normalizeSavedFilters", () => {
  it("keeps valid saved filters", () => {
    const filters = normalizeSavedFilters([
      { name: "API errors", query: "status:401,403 path:/api", surface: "traffic" },
      { name: "Frames", query: "direction:sent", surface: "websocket" },
      { name: "Both", query: "host:allowed.test", surface: "both" }
    ]);
    expect(filters).toHaveLength(3);
    expect(filters[0]?.surface).toBe("traffic");
    expect(filters[2]?.surface).toBe("both");
  });

  it("drops invalid saved filters and clamps arrays", () => {
    expect(normalizeSavedFilter({}, "id-1", "now")).toBeNull();
    expect(normalizeSavedFilters([{ name: "", query: "status:401" }])).toEqual([]);
    expect(normalizeSavedFilters("bad")).toEqual([]);
    const many = Array.from({ length: 50 }, (_, index) => ({
      name: `Filter ${index}`,
      query: `status:${index}`
    }));
    expect(normalizeSavedFilters(many)).toHaveLength(40);
  });

  it("defaults unknown surfaces to both", () => {
    const [filter] = normalizeSavedFilters([{ name: "X", query: "host:test", surface: "invalid" }]);
    expect(filter?.surface).toBe("both");
  });
});
