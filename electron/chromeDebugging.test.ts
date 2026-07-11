import { describe, expect, it, vi } from "vitest";
import { cdpTargetMatchesRequestedUrl, findCdpEndpointForUrl } from "./chromeDebugging.js";

describe("chromeDebugging", () => {
  it("matches page targets for the requested URL and common www redirects", () => {
    expect(
      cdpTargetMatchesRequestedUrl(
        {
          type: "page",
          url: "https://www.hairetsu.com/",
          webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1"
        },
        "https://hairetsu.com"
      )
    ).toBe(true);
    expect(
      cdpTargetMatchesRequestedUrl(
        {
          type: "service_worker",
          url: "https://www.hairetsu.com/sw.js",
          webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/2"
        },
        "https://hairetsu.com"
      )
    ).toBe(false);
    expect(
      cdpTargetMatchesRequestedUrl(
        {
          type: "page",
          url: "https://other.test/",
          webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/3"
        },
        "https://hairetsu.com"
      )
    ).toBe(false);
  });

  it("finds an existing debugging endpoint with the requested page target", async () => {
    const fetchTargets = vi.fn(async (endpoint: string) => {
      if (endpoint.endsWith(":9223")) {
        throw new Error("fetch failed");
      }
      if (endpoint.endsWith(":9224")) {
        return [];
      }
      return [
        {
          type: "page",
          url: "https://www.hairetsu.com/",
          webSocketDebuggerUrl: "ws://127.0.0.1:9225/devtools/page/1"
        }
      ];
    });

    await expect(
      findCdpEndpointForUrl({
        requestedUrl: "https://hairetsu.com",
        startPort: 9223,
        portCount: 3,
        fetchTargets
      })
    ).resolves.toBe("http://127.0.0.1:9225");
    expect(fetchTargets).toHaveBeenCalledTimes(3);
  });
});
