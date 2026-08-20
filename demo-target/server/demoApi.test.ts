import { describe, expect, it } from "vitest";
import { handleDemoRequest, type DemoRequest, type DemoResponse } from "./demoApi";

function request(overrides: Partial<DemoRequest>): DemoRequest {
  return {
    method: "GET",
    pathname: "/api/cargo/search",
    searchParams: new URLSearchParams(),
    origin: null,
    body: "",
    ...overrides
  };
}

function requiredResponse(response: DemoResponse | null): DemoResponse {
  if (response === null) {
    throw new Error("Expected the Harborline API to handle the request.");
  }
  return response;
}

function parsedBody(response: DemoResponse): unknown {
  return JSON.parse(response.body);
}

describe("Harborline API", () => {
  it("returns a normal operations summary without challenge metadata", () => {
    const response = requiredResponse(
      handleDemoRequest(request({ pathname: "/api/ops/summary" }))
    );

    expect(response.status).toBe(200);
    expect(parsedBody(response)).toMatchObject({ terminal: "NAT-04", activeShipments: 42 });
    expect(response.headers["X-Demo-Scenario"]).toBeUndefined();
  });

  it("returns only public cargo fields for a normal search", () => {
    const response = requiredResponse(
      handleDemoRequest(request({ searchParams: new URLSearchParams({ q: "Orion" }) }))
    );

    expect(parsedBody(response)).toEqual({
      items: [
        {
          id: "HL-2048",
          client: "Orion Machine Works",
          route: "Newark > Reykjavik",
          status: "Customs hold",
          eta: "Aug 20, 16:40"
        }
      ],
      total: 1
    });
  });

  it("expands a manipulated cargo search without labeling the weakness", () => {
    const response = requiredResponse(
      handleDemoRequest(
        request({ searchParams: new URLSearchParams({ q: "' OR '1'='1' --" }) })
      )
    );
    const serialized = response.body;

    expect(response.status).toBe(200);
    expect(serialized).toContain("DEMO_NORTHWIND_4K8");
    expect(serialized).not.toContain("vulnerable");
    expect(serialized).not.toContain("SQLI-01");
  });

  it("returns another account invoice without explanatory fields", () => {
    const response = requiredResponse(
      handleDemoRequest(request({ pathname: "/api/billing/invoices/INV-1008" }))
    );

    expect(parsedBody(response)).toEqual({
      invoice: {
        id: "INV-1008",
        accountId: "ACCT-92",
        customer: "Vela Biologics",
        issued: "2026-08-13",
        due: "2026-09-12",
        total: 32600,
        status: "Paid",
        bankReference: "DEMO-WIRE-44102"
      }
    });
  });

  it("serves fixed data for manipulated file and integration requests", () => {
    const file = requiredResponse(
      handleDemoRequest(
        request({
          pathname: "/api/files/read",
          searchParams: new URLSearchParams({ path: "../../../../etc/passwd" })
        })
      )
    );
    const integration = requiredResponse(
      handleDemoRequest(
        request({
          method: "POST",
          pathname: "/api/integrations/preview",
          body: JSON.stringify({ url: "http://169.254.169.254/latest/meta-data/" })
        })
      )
    );

    expect(file.body).toContain("root:x:0:0");
    expect(integration.body).toContain("ASIADEMO000000000001");
    expect(file.body).not.toContain("fixed training fixture");
    expect(integration.body).not.toContain("outboundRequestMade");
  });

  it("accepts an unlisted profile role and returns unescaped support markup", () => {
    const profile = requiredResponse(
      handleDemoRequest(
        request({
          method: "POST",
          pathname: "/api/operators/profile",
          body: JSON.stringify({
            displayName: "Mira Chen",
            jobTitle: "Dispatch coordinator",
            role: "administrator"
          })
        })
      )
    );
    const support = requiredResponse(
      handleDemoRequest(
        request({
          pathname: "/api/support/preview",
          searchParams: new URLSearchParams({ message: "<img src=x onerror=alert(1)>" })
        })
      )
    );

    expect(parsedBody(profile)).toMatchObject({
      profile: { role: "administrator", clearance: 9 }
    });
    expect(support.body).toContain("<img src=x onerror=alert(1)>");
  });

  it("reflects an arbitrary origin with credentials", () => {
    const response = requiredResponse(
      handleDemoRequest(
        request({
          method: "OPTIONS",
          pathname: "/api/cargo/search",
          origin: "https://attacker.invalid"
        })
      )
    );

    expect(response.status).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://attacker.invalid");
    expect(response.headers["Access-Control-Allow-Credentials"]).toBe("true");
  });
});
