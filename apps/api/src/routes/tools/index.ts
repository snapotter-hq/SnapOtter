import type { FastifyInstance } from "fastify";
import { registerResize } from "./resize.js";
import { registerCrop } from "./crop.js";
import { registerRotate } from "./rotate.js";
import { registerConvert } from "./convert.js";
import { registerCompress } from "./compress.js";
import { registerStripMetadata } from "./strip-metadata.js";
import { registerColorAdjustments } from "./color-adjustments.js";

/**
 * Registry that imports and registers all tool routes.
 * Each tool uses the createToolRoute factory from tool-factory.ts.
 */
export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  registerResize(app);
  registerCrop(app);
  registerRotate(app);
  registerConvert(app);
  registerCompress(app);
  registerStripMetadata(app);
  registerColorAdjustments(app);

  app.log.info("Tool routes registered (7 tools, 10 endpoints)");
}
