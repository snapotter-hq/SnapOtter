import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { extractText } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createWorkspace } from "../../lib/workspace.js";
import { updateSingleFileProgress } from "../progress.js";

const settingsSchema = z.object({
  quality: z.enum(["fast", "balanced", "best"]).default("balanced"),
  language: z.enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko"]).default("auto"),
  enhance: z.boolean().default(true),
  // Backward compat: old "engine" param still accepted
  engine: z.enum(["tesseract", "paddleocr"]).optional(),
});

/**
 * OCR / text extraction route.
 * Returns JSON with extracted text rather than an image.
 */
export function registerOcr(app: FastifyInstance) {
  app.post("/api/v1/tools/ocr", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "ocr";
    if (!isToolInstalled(toolId)) {
      const bundle = getBundleForTool(toolId);
      return reply.status(501).send({
        error: "Feature not installed",
        code: "FEATURE_NOT_INSTALLED",
        feature: TOOL_BUNDLE_MAP[toolId],
        featureName: bundle?.name ?? toolId,
        estimatedSize: bundle?.estimatedSize ?? "unknown",
      });
    }

    let fileBuffer: Buffer | null = null;
    let filename = "image";
    let settingsRaw: string | null = null;
    let clientJobId: string | null = null;

    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === "file") {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
          filename = basename(part.filename ?? "image");
        } else if (part.fieldname === "settings") {
          settingsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          clientJobId = part.value as string;
        }
      }
    } catch (err) {
      return reply.status(400).send({
        error: "Failed to parse multipart request",
        details: err instanceof Error ? err.message : String(err),
      });
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: "No image file provided" });
    }

    const validation = await validateImageBuffer(fileBuffer, filename);
    if (!validation.valid) {
      return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
    }

    try {
      let settings: z.infer<typeof settingsSchema>;
      try {
        const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
        const result = settingsSchema.safeParse(parsed);
        if (!result.success) {
          return reply
            .status(400)
            .send({ error: "Invalid settings", details: formatZodErrors(result.error.issues) });
        }
        settings = result.data;
      } catch {
        return reply.status(400).send({ error: "Settings must be valid JSON" });
      }

      // Backward compat: map old engine param to quality
      let quality = settings.quality;
      if (settings.engine && !settingsRaw?.includes('"quality"')) {
        quality = settings.engine === "tesseract" ? "fast" : "balanced";
      }

      request.log.info(
        {
          toolId: "ocr",
          imageSize: fileBuffer.length,
          quality,
          language: settings.language,
        },
        "Starting OCR",
      );
      const jobId = randomUUID();
      const workspacePath = await createWorkspace(jobId);

      const jobIdForProgress = clientJobId;
      const onProgress = jobIdForProgress
        ? (percent: number, stage: string) => {
            updateSingleFileProgress({
              jobId: jobIdForProgress,
              phase: "processing",
              stage,
              percent,
            });
          }
        : undefined;

      // Fallback chain: best -> balanced -> fast
      // PaddleOCR can crash with segfault on some platforms, so we retry
      // with a lower quality tier at the Node.js level.
      const fallbackChain: Array<"fast" | "balanced" | "best"> =
        quality === "best"
          ? ["best", "balanced", "fast"]
          : quality === "balanced"
            ? ["balanced", "fast"]
            : ["fast"];

      let lastError: unknown;
      for (const tier of fallbackChain) {
        try {
          const result = await extractText(
            fileBuffer,
            workspacePath,
            {
              quality: tier,
              language: settings.language,
              enhance: settings.enhance,
            },
            onProgress,
          );

          if (clientJobId) {
            updateSingleFileProgress({
              jobId: clientJobId,
              phase: "complete",
              percent: 100,
            });
          }

          const expectedEngine =
            tier === "fast" ? "tesseract" : tier === "balanced" ? "paddleocr" : "paddleocr-vl";
          if (result.engine && result.engine !== expectedEngine) {
            request.log.warn(
              { toolId: "ocr", requested: tier, expected: expectedEngine, actual: result.engine },
              `OCR engine fallback: requested ${tier} (${expectedEngine}) but used ${result.engine}`,
            );
          }

          return reply.send({
            jobId,
            filename,
            text: result.text,
            engine: result.engine,
          });
        } catch (err) {
          lastError = err;
          const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
          // If the Python process crashed (segfault, dispatcher exit), try next tier
          if (
            msg.includes("exited unexpectedly") ||
            msg.includes("exited with code") ||
            msg.includes("segmentation fault") ||
            msg.includes("process crashed")
          ) {
            request.log.warn(
              { toolId: "ocr", quality: tier, err },
              `OCR ${tier} crashed, falling back`,
            );
            if (onProgress) onProgress(15, "Retrying...");
            continue;
          }
          // Non-crash errors (validation, timeout) should not retry
          throw err;
        }
      }

      // All tiers failed
      throw lastError;
    } catch (err) {
      request.log.error({ err, toolId: "ocr" }, "OCR failed");
      return reply.status(422).send({
        error: "OCR failed",
        details: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });
}
