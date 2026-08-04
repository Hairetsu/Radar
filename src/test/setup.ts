import "@testing-library/jest-dom/vitest";
import { createRadarApiStub } from "./radarApiStub";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "radar", {
    value: createRadarApiStub(),
    writable: true
  });

  // jsdom has no layout engine and therefore no scroll implementation.
  Element.prototype.scrollIntoView ||= () => {};
}
