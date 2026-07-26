/**
 * Route resolution for the tool access gate (issue #645).
 *
 * The gate protects whatever tool this resolves, so getting it wrong either
 * opens a tool up or 403s something that was never a tool run. It reads the
 * matched route pattern rather than the raw URL on purpose: find-my-way
 * decodes before matching, so a second parse of the raw string disagrees with
 * the router and fails open on `/api/v1/tools/image/%66avicon`.
 */
import { apiToolPath, TOOLS, toolSection } from "@snapotter/shared";
import { describe, expect, it } from "vitest";
import { toolIdFromRoute } from "../../../apps/api/src/plugins/tool-access.js";

const BATCH_PATTERN = "/api/v1/tools/:section/:toolId/batch";

describe("toolIdFromRoute", () => {
  it("resolves every tool in the catalog from its own registered path", () => {
    const unresolved = TOOLS.filter(
      (tool) => toolIdFromRoute(apiToolPath(tool.id)) !== tool.id,
    ).map((tool) => tool.id);
    expect(unresolved, `tools whose own path does not resolve: ${unresolved.join(", ")}`).toEqual(
      [],
    );
  });

  it.each(["batch", "info", "preview", "analyze", "inspect", "generate", "effects"])(
    "resolves the /%s sub-path to its parent tool",
    (suffix) => {
      expect(toolIdFromRoute(`/api/v1/tools/image/resize/${suffix}`)).toBe("resize");
    },
  );

  it("resolves the parametric batch route from the router's decoded params", () => {
    expect(toolIdFromRoute(BATCH_PATTERN, { section: "image", toolId: "resize" })).toBe("resize");
  });

  it("returns null when the parametric route names an unknown tool", () => {
    expect(toolIdFromRoute(BATCH_PATTERN, { section: "image", toolId: "nope" })).toBeNull();
  });

  it("returns null when the parametric route's section does not match the tool", () => {
    expect(toolIdFromRoute(BATCH_PATTERN, { section: "video", toolId: "resize" })).toBeNull();
  });

  it("returns null when the parametric route has no params", () => {
    expect(toolIdFromRoute(BATCH_PATTERN)).toBeNull();
  });

  it.each([
    ["no matched route", undefined],
    ["the catalog root", "/api/v1/tools/"],
    ["a single-segment listing", "/api/v1/tools/popular"],
    ["an unrelated route", "/api/v1/jobs/:jobId/progress"],
    ["a path that merely looks similar", "/api/v1/toolsomething/image/resize"],
  ])("returns null for %s", (_label, routeUrl) => {
    expect(toolIdFromRoute(routeUrl)).toBeNull();
  });

  it("returns null for an unknown tool id so the route can still 404", () => {
    expect(toolIdFromRoute("/api/v1/tools/image/not-a-real-tool")).toBeNull();
  });

  it("returns null when a real tool is registered under the wrong section", () => {
    const image = TOOLS.find((t) => toolSection(t) === "image");
    if (!image) throw new Error("no image-section tool in the catalog");
    expect(toolIdFromRoute(`/api/v1/tools/video/${image.id}`)).toBeNull();
  });
});
