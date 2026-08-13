import {
  POSTHOG_PROXY_PATH,
  posthogAssetsHost,
  posthogUiHost,
  resolvePostHogClientHosts,
} from "@snapotter/shared";
import { describe, expect, it } from "vitest";

// PostHog splits ingestion (<region>.i.posthog.com) from static assets
// (<region>-assets.i.posthog.com) and the product UI (<region>.posthog.com).
// The self-hosted proxy derives all three from the single baked ingestion host,
// so these helpers are the single source of truth for that mapping.

describe("posthogAssetsHost", () => {
  it("maps the US ingestion host to its assets sibling", () => {
    expect(posthogAssetsHost("https://us.i.posthog.com")).toBe("https://us-assets.i.posthog.com");
  });

  it("maps the EU ingestion host to its assets sibling", () => {
    expect(posthogAssetsHost("https://eu.i.posthog.com")).toBe("https://eu-assets.i.posthog.com");
  });

  it("strips one or more trailing slashes", () => {
    expect(posthogAssetsHost("https://us.i.posthog.com/")).toBe("https://us-assets.i.posthog.com");
    expect(posthogAssetsHost("https://us.i.posthog.com///")).toBe(
      "https://us-assets.i.posthog.com",
    );
  });

  it("leaves a self-hosted PostHog host unchanged (assets share the host)", () => {
    expect(posthogAssetsHost("https://posthog.acme.internal")).toBe(
      "https://posthog.acme.internal",
    );
  });
});

describe("posthogUiHost", () => {
  it("maps the US ingestion host to the product host", () => {
    expect(posthogUiHost("https://us.i.posthog.com")).toBe("https://us.posthog.com");
  });

  it("maps the EU ingestion host to the product host", () => {
    expect(posthogUiHost("https://eu.i.posthog.com")).toBe("https://eu.posthog.com");
  });

  it("leaves a self-hosted PostHog host unchanged", () => {
    expect(posthogUiHost("https://posthog.acme.internal")).toBe("https://posthog.acme.internal");
  });
});

describe("resolvePostHogClientHosts", () => {
  it("points api_host at the instance's own /ingest and ui_host at the product when proxying", () => {
    expect(
      resolvePostHogClientHosts({
        posthogHost: "https://us.i.posthog.com",
        posthogProxyPath: POSTHOG_PROXY_PATH,
        origin: "https://snap.example.com",
      }),
    ).toEqual({ apiHost: "https://snap.example.com/ingest", uiHost: "https://us.posthog.com" });
  });

  it("does not double a trailing slash on the origin", () => {
    expect(
      resolvePostHogClientHosts({
        posthogHost: "https://us.i.posthog.com",
        posthogProxyPath: "/ingest",
        origin: "https://snap.example.com/",
      }).apiHost,
    ).toBe("https://snap.example.com/ingest");
  });

  it("falls back to the direct host with no ui_host when the proxy path is empty", () => {
    expect(
      resolvePostHogClientHosts({
        posthogHost: "https://us.i.posthog.com",
        posthogProxyPath: "",
        origin: "https://snap.example.com",
      }),
    ).toEqual({ apiHost: "https://us.i.posthog.com" });
  });
});

describe("POSTHOG_PROXY_PATH", () => {
  it("is a neutral root-relative path that avoids ad-blocker-flagged segments", () => {
    expect(POSTHOG_PROXY_PATH).toMatch(/^\/[a-z]+$/);
    expect(POSTHOG_PROXY_PATH).not.toMatch(/analytics|tracking|telemetry|posthog/);
    expect(POSTHOG_PROXY_PATH).not.toBe("/ph");
  });
});
