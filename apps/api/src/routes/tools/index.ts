import { PYTHON_SIDECAR_TOOLS, TOOLS } from "@stirling-image/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db, schema } from "../../db/index.js";
import { registerBarcodeRead } from "./barcode-read.js";
import { registerBlurFaces } from "./blur-faces.js";
import { registerBorder } from "./border.js";
import { registerBulkRename } from "./bulk-rename.js";
import { registerCollage } from "./collage.js";
import { registerColorAdjustments } from "./color-adjustments.js";
import { registerColorPalette } from "./color-palette.js";
import { registerCompare } from "./compare.js";
import { registerCompose } from "./compose.js";
import { registerCompress } from "./compress.js";
import { registerConvert } from "./convert.js";
import { registerCrop } from "./crop.js";
import { registerEditMetadata } from "./edit-metadata.js";
import { registerEraseObject } from "./erase-object.js";
import { registerFavicon } from "./favicon.js";
import { registerFindDuplicates } from "./find-duplicates.js";
import { registerGifTools } from "./gif-tools.js";
import { registerImageToPdf } from "./image-to-pdf.js";
import { registerInfo } from "./info.js";
import { registerOcr } from "./ocr.js";
import { registerQrGenerate } from "./qr-generate.js";
import { registerRemoveBackground } from "./remove-background.js";
import { registerReplaceColor } from "./replace-color.js";
import { registerResize } from "./resize.js";
import { registerRotate } from "./rotate.js";
import { registerSmartCrop } from "./smart-crop.js";
import { registerSplit } from "./split.js";
import { registerStripMetadata } from "./strip-metadata.js";
import { registerSvgToRaster } from "./svg-to-raster.js";
import { registerTextOverlay } from "./text-overlay.js";
import { registerUpscale } from "./upscale.js";
import { registerVectorize } from "./vectorize.js";
import { registerWatermarkImage } from "./watermark-image.js";
import { registerWatermarkText } from "./watermark-text.js";

/**
 * Registry that imports and registers all tool routes.
 * Each tool uses the createToolRoute factory from tool-factory.ts.
 *
 * Tools listed in the `disabledTools` setting or marked `experimental`
 * (when `enableExperimentalTools` is off) are skipped at startup.
 */
export async function registerToolRoutes(app: FastifyInstance): Promise<void> {
  // Read disabled tools from settings
  const disabledRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "disabledTools"))
    .get();
  const disabledTools: string[] = disabledRow ? JSON.parse(disabledRow.value) : [];

  // Read experimental flag
  const expRow = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "enableExperimentalTools"))
    .get();
  const enableExperimental = expRow?.value === "true";

  // Get experimental tool IDs from shared constants
  const experimentalToolIds = TOOLS.filter((t) => t.experimental).map((t) => t.id);

  // Build skip set
  const skipTools = new Set([...disabledTools, ...(enableExperimental ? [] : experimentalToolIds)]);

  // In lite mode, register 501 stubs for AI tools instead of real handlers
  const isLite = process.env.STIRLING_VARIANT === "lite";
  const liteStubTools = new Set<string>(PYTHON_SIDECAR_TOOLS);

  const toolRegistrations: Array<{
    id: string;
    register: (app: FastifyInstance) => void;
  }> = [
    // Essentials
    { id: "resize", register: registerResize },
    { id: "crop", register: registerCrop },
    { id: "rotate", register: registerRotate },
    { id: "convert", register: registerConvert },
    { id: "compress", register: registerCompress },
    { id: "strip-metadata", register: registerStripMetadata },
    { id: "edit-metadata", register: registerEditMetadata },
    { id: "color-adjustments", register: registerColorAdjustments },

    // Watermark & Overlay
    { id: "watermark-text", register: registerWatermarkText },
    { id: "watermark-image", register: registerWatermarkImage },
    { id: "text-overlay", register: registerTextOverlay },
    { id: "compose", register: registerCompose },

    // Utilities
    { id: "info", register: registerInfo },
    { id: "compare", register: registerCompare },
    { id: "find-duplicates", register: registerFindDuplicates },
    { id: "color-palette", register: registerColorPalette },
    { id: "qr-generate", register: registerQrGenerate },
    { id: "barcode-read", register: registerBarcodeRead },

    // Layout & Composition
    { id: "collage", register: registerCollage },
    { id: "split", register: registerSplit },
    { id: "border", register: registerBorder },

    // Format & Conversion
    { id: "svg-to-raster", register: registerSvgToRaster },
    { id: "vectorize", register: registerVectorize },
    { id: "gif-tools", register: registerGifTools },

    // Optimization extras
    { id: "bulk-rename", register: registerBulkRename },
    { id: "favicon", register: registerFavicon },
    { id: "image-to-pdf", register: registerImageToPdf },

    // Adjustments extra
    { id: "replace-color", register: registerReplaceColor },

    // AI Tools
    { id: "remove-background", register: registerRemoveBackground },
    { id: "upscale", register: registerUpscale },
    { id: "ocr", register: registerOcr },
    { id: "blur-faces", register: registerBlurFaces },
    { id: "erase-object", register: registerEraseObject },
    { id: "smart-crop", register: registerSmartCrop },
  ];

  let skipped = 0;
  let stubbed = 0;
  for (const { id, register } of toolRegistrations) {
    if (skipTools.has(id)) {
      app.log.info(`Skipping disabled/experimental tool: ${id}`);
      skipped++;
      continue;
    }

    if (isLite && liteStubTools.has(id)) {
      // Register a 501 stub instead of the real handler
      app.post(`/api/v1/tools/${id}`, async (_request, reply) => {
        return reply.status(501).send({
          statusCode: 501,
          error: "Not Available",
          message: `The "${id}" tool requires the full image. Pull stirlingimage/stirling-image:latest for all features.`,
        });
      });
      stubbed++;
      continue;
    }

    register(app);
  }

  const registered = toolRegistrations.length - skipped - stubbed;
  app.log.info(
    `Tool routes: ${registered} active, ${stubbed} lite-stubbed, ${skipped} skipped (${toolRegistrations.length} total)`,
  );
}
