/**
 * URL resolution for the tool access gate (issue #645).
 *
 * The gate keys off whatever tool the URL names, so this mapping is what
 * decides whether an endpoint is protected. Getting it wrong either opens a
 * tool up or 403s something that was never a tool run, and neither shows up
 * as a test failure anywhere else.
 */
import { apiToolPath, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { toolIdFromUrl } from "../../../apps/api/src/plugins/tool-access.js";

describe("toolIdFromUrl", () => {
  it("resolves every tool in the catalog from its canonical path", () => {
    const unresolved = TOOLS.filter((tool) => toolIdFromUrl(apiToolPath(tool.id)) !== tool.id).map(
      (tool) => tool.id,
    );
    expect(unresolved, `tools whose own path does not resolve: ${unresolved.join(", ")}`).toEqual(
      [],
    );
  });

  it.each(["batch", "info", "preview", "analyze", "inspect", "generate", "effects"])(
    "resolves the /%s sub-path to its parent tool",
    (suffix) => {
      expect(toolIdFromUrl(`/api/v1/tools/image/resize/${suffix}`)).toBe("resize");
    },
  );

  it("ignores the query string", () => {
    expect(toolIdFromUrl("/api/v1/tools/image/resize?width=10")).toBe("resize");
  });

  it("tolerates a trailing slash", () => {
    expect(toolIdFromUrl("/api/v1/tools/image/resize/")).toBe("resize");
  });

  it.each([
    ["the catalog root", "/api/v1/tools/"],
    ["a single-segment listing", "/api/v1/tools/popular"],
    ["an unrelated route", "/api/v1/jobs/abc/progress"],
    ["a path that merely looks similar", "/api/v1/toolsomething/image/resize"],
  ])("returns null for %s", (_label, url) => {
    expect(toolIdFromUrl(url)).toBeNull();
  });

  it("returns null for an unknown tool id so the route can still 404", () => {
    expect(toolIdFromUrl("/api/v1/tools/image/not-a-real-tool")).toBeNull();
  });

  it("returns null when a real tool is requested under the wrong section", () => {
    const image = TOOLS.find((t) => toolSection(t) === "image");
    if (!image) throw new Error("no image-section tool in the catalog");
    expect(toolIdFromUrl(`/api/v1/tools/video/${image.id}`)).toBeNull();
  });
});
