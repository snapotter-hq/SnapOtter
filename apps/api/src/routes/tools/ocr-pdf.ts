import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractPdfText } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";

const settingsSchema = z.object({
  quality: z.enum(["fast", "balanced", "best"]).default("balanced"),
  language: z.enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko"]).default("auto"),
  pages: z.string().max(100).default("all"),
});

// -- AI job handler (runs inside the BullMQ worker) --
registerAiJobHandler("ocr-pdf", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  ctx.report(5, "Preparing PDF");

  // Write the input buffer to a temp file (extractPdfText needs a file path)
  const pdfDir = join(ctx.scratchDir, "pdf");
  await mkdir(pdfDir, { recursive: true });
  const pdfPath = join(pdfDir, data.filename);
  await writeFile(pdfPath, input);

  ctx.report(10, "Extracting text from PDF");

  const result = await extractPdfText(
    pdfPath,
    {
      quality: settings.quality,
      language: settings.language,
      pages: settings.pages,
    },
    (percent, stage) => ctx.report(percent, stage),
  );

  const base = data.filename.replace(/\.[^.]+$/, "");
  const outName = `${base}_ocr.txt`;

  return {
    buffer: Buffer.from(result.text, "utf-8"),
    filename: outName,
    contentType: "text/plain",
    resultPayload: {
      pages: result.pages,
      engine: result.engine,
    },
  };
});

export function registerOcrPdf(app: FastifyInstance) {
  app.post("/api/v1/tools/ocr-pdf", async (request: FastifyRequest, reply: FastifyReply) => {
    const toolId = "ocr-pdf";
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
    let filename = "document.pdf";
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
      return reply.status(400).send({ error: "No PDF file provided" });
    }

    let settings: z.infer<typeof settingsSchema>;
    try {
      const parsed = settingsRaw ? JSON.parse(settingsRaw) : {};
      const result = settingsSchema.safeParse(parsed);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(result.error.issues),
        });
      }
      settings = result.data;
    } catch {
      return reply.status(400).send({ error: "Settings must be valid JSON" });
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
  });
}
