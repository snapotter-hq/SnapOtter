import { TOOLS, toolSection } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { requireToolAccess } from "../permissions.js";

const TOOLS_PREFIX = "/api/v1/tools/";

/** toolId -> section, so a route resolves without scanning the catalog. */
const SECTION_BY_TOOL_ID = new Map(TOOLS.map((tool) => [tool.id, toolSection(tool)]));

/**
 * The tool a request targets, read from the route the router actually matched
 * rather than from the raw URL.
 *
 * This distinction is the whole point. find-my-way percent-decodes before
 * matching, so `/api/v1/tools/image/%66avicon` runs the favicon handler while
 * a second, independent parse of the raw string sees no tool at all and waves
 * it through. Taking the router's own answer means the gate and the router
 * cannot disagree. `routeUrl` is the registered pattern, so it is already
 * canonical for static routes; the one parametric tool route
 * (`:section/:toolId/batch`) fills in from params, which Fastify has likewise
 * already decoded.
 *
 * Null means "not a per-tool endpoint": the catalog listings, and ids no tool
 * claims. Leaving those alone keeps an unknown or misfiled tool a 404 rather
 * than telling an unauthorized caller which ids exist.
 */
export function toolIdFromRoute(
  routeUrl: string | undefined,
  params?: { section?: string; toolId?: string },
): string | null {
  if (!routeUrl?.startsWith(TOOLS_PREFIX)) return null;
  const [patternSection, patternToolId] = routeUrl.slice(TOOLS_PREFIX.length).split("/");
  if (!patternSection || !patternToolId) return null;
  const section = patternSection === ":section" ? params?.section : patternSection;
  const toolId = patternToolId === ":toolId" ? params?.toolId : patternToolId;
  if (!section || !toolId) return null;
  return SECTION_BY_TOOL_ID.get(toolId) === section ? toolId : null;
}

/**
 * Enforce tool access for every per-tool endpoint from one place.
 *
 * createToolRoute gates the tools it builds, but the 45 hand-written routes
 * each had to remember the same call and none of them did, so a role without
 * `tools:use` could run image-to-pdf, svg-to-raster, erase-object, favicon and
 * the rest (issue #645). Per-route calls are exactly what drifted, so the
 * check keys off the matched route and therefore covers sub-paths (/batch,
 * /info, /preview, /analyze, /inspect) and any route added later without it
 * having to opt in.
 *
 * Must be registered after the auth middleware, which populates request.user.
 * The remaining per-route calls stay as defense in depth.
 */
export async function toolAccessMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    const toolId = toolIdFromRoute(
      request.routeOptions?.url,
      request.params as { section?: string; toolId?: string } | undefined,
    );
    if (!toolId) return;
    if (!(await requireToolAccess(request, reply, toolId))) return reply;
  });
}
