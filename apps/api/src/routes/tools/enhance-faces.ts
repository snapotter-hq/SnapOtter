import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enhanceFaces } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { autoOrient } from "../../lib/auto-orient.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { decodeToSharpCompat, needsCliDecode } from "../../lib/format-decoders.js";
import { decodeHeic } from "../../lib/heic-converter.js";
import { getObjectBuffer, putObject } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { registerToolProcessFn } from "../tool-factory.js";

const settingsSchema = z.object({
  model: z.enum(["auto", "gfpgan", "codeformer"]).default("auto"),
  strength: z.number().min(0).max(1).default(0.8),
  onlyCenterFace: z.boolean().default(false),
  sensitivity: z.number().min(0).max(1).default(0.5),
});

// ── AI job handler ────────────────────────────────────────────────
registerAiJobHandler("enhance-faces", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  const result = await enhanceFaces(
    input,
    ctx.scratchDir,
    {
      model: settings.model,
      strength: settings.strength,
      onlyCenterFace: settings.onlyCenterFace,
      sensitivity: settings.sensitivity,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  const outputFilename = `${data.filename.replace(/\.[^.]+$/, "")}_enhanced.png`;

  return {
    buffer: result.buffer,
    filename: outputFilename,
    contentType: "image/png",
    resultPayload: {
      facesDetected: result.facesDetected,
      faces: result.faces,
      model: result.model,
    },
  };
});

/** Face enhancement route using GFPGAN/CodeFormer. */
export function registerEnhanceFaces(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/enhance-faces",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "enhance-faces";
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

      const userId = getAuthUser(request)?.id ?? null;
      const jobId = randomUUID();
      let fileBuffer: Buffer | null = null;
      let filename = "image";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;
      let fileId: string | null = null;
      let inputKey: string | null = null;

      try {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === "file") {
            const upload = await receiveUpload(part, jobId);
            inputKey = upload.key;
            filename = upload.filename;
          } else if (part.fieldname === "settings") {
            settingsRaw = part.value as string;
          } else if (part.fieldname === "clientJobId") {
            const raw = part.value as string;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
              clientJobId = raw;
            }
          } else if (part.fieldname === "fileId") {
            fileId = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No image file provided" });
      }

      fileBuffer = await getObjectBuffer(inputKey);

      const validation = await validateImageBuffer(fileBuffer, filename);
      if (!validation.valid) {
        return reply.status(400).send({ error: `Invalid image: ${validation.reason}` });
      }

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

      try {
        if (validation.format === "heif") {
          fileBuffer = await decodeHeic(fileBuffer);
        }
        if (needsCliDecode(validation.format)) {
          fileBuffer = await decodeToSharpCompat(fileBuffer, validation.format);
        }
        fileBuffer = await autoOrient(fileBuffer);
      } catch (err) {
        request.log.error({ err, toolId: "enhance-faces" }, "Input decoding failed");
        return reply.status(422).send({
          error: "Face enhancement failed",
          details: stripInternalPaths(err instanceof Error ? err.message : "Unknown error"),
        });
      }

      const decodedKey = `uploads/${jobId}/${filename}`;
      if (decodedKey !== inputKey) {
        await putObject(decodedKey, fileBuffer);
        inputKey = decodedKey;
      } else {
        await putObject(inputKey, fileBuffer);
      }

      const progressJobId = clientJobId || jobId;

      await enqueueToolJob({
        jobId,
        toolId,
        userId,
        pool: "ai",
        inputRefs: [inputKey],
        filename,
        settings,
        clientJobId: clientJobId ?? undefined,
        fileId: fileId ?? undefined,
        kind: "ai-tool",
      });

      return reply.status(202).send({ jobId: progressJobId, async: true });
    },
  );

  // Register in the pipeline/batch registry
  registerToolProcessFn({
    toolId: "enhance-faces",
    settingsSchema: z.object({
      model: z.enum(["auto", "gfpgan", "codeformer"]).default("auto"),
      strength: z.number().min(0).max(1).default(0.8),
      onlyCenterFace: z.boolean().default(false),
      sensitivity: z.number().min(0).max(1).default(0.5),
    }),
    process: async (inputBuffer, settings, filename, ctx) => {
      const s = settings as {
        model?: "auto" | "gfpgan" | "codeformer";
        strength?: number;
        onlyCenterFace?: boolean;
        sensitivity?: number;
      };
      const orientedBuffer = await autoOrient(inputBuffer);
      const scratchDir = ctx?.scratchDir ?? join(tmpdir(), "snapotter-scratch", randomUUID());
      const needsCleanup = !ctx?.scratchDir;
      if (needsCleanup) await mkdir(scratchDir, { recursive: true });
      try {
        const result = await enhanceFaces(orientedBuffer, scratchDir, {
          model: s.model ?? "auto",
          strength: s.strength ?? 0.8,
          onlyCenterFace: s.onlyCenterFace ?? false,
          sensitivity: s.sensitivity ?? 0.5,
        });
        const outputFilename = `${filename.replace(/\.[^.]+$/, "")}_enhanced.png`;
        return { buffer: result.buffer, filename: outputFilename, contentType: "image/png" };
      } finally {
        if (needsCleanup) await rm(scratchDir, { recursive: true, force: true }).catch(() => {});
      }
    },
  });
}
