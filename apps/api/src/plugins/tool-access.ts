import { TOOLS, toolSection } from "@snapotter/shared";
import type { FastifyInstance } from "fastify";
import { requireToolAccess } from "../permissions.js";

const TOOLS_PREFIX = "/api/v1/tools/";

/** toolId -> section, so a URL resolves without scanning the catalog. */
const SECTION_BY_TOOL_ID = new Map(TOOLS.map((tool) => [tool.id, toolSection(tool)]));

/**
 * The tool a request targets, or null if it targets none.
 *
 * Null covers the catalog listings (`/api/v1/tools/`, `/api/v1/tools/popular`)
 * and any id no tool claims. Leaving those ungated keeps an unknown or
 * misfiled tool a 404 instead of turning it into a 403, which would otherwise
 * tell an unauthorized caller which ids exist.
 */
export function toolIdFromUrl(url: string): string | null {
  const path = url.split("?")[0];
  if (!path.startsWith(TOOLS_PREFIX)) return null;
  const [section, toolId] = path.slice(TOOLS_PREFIX.length).split("/");
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
 * check keys off the tool id in the URL and therefore covers sub-paths
 * (/batch, /info, /preview, /analyze, /inspect) and any route added later
 * without it having to opt in.
 *
 * Must be registered after the auth middleware, which is what populates
 * request.user. The remaining per-route calls are left in place as defense in
 * depth.
 */
export async function toolAccessMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    const toolId = toolIdFromUrl(request.url);
    if (!toolId) return;
    if (!(await requireToolAccess(request, reply, toolId))) return reply;
  });
}
