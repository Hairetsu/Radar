import "@testing-library/jest-dom/vitest";
import { createRadarApiStub } from "./radarApiStub";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "radar", {
    value: createRadarApiStub(),
    writable: true
  });
}
