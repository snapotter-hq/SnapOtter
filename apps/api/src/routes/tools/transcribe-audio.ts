import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { transcribeAudio } from "@snapotter/ai";
import { getBundleForTool, TOOL_BUNDLE_MAP } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { isToolInstalled } from "../../lib/feature-status.js";
import { type TranscriptSegment, toSrt, toVtt } from "../../lib/subtitle-format.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";

const settingsSchema = z.object({
  language: z
    .enum(["auto", "en", "de", "fr", "es", "zh", "ja", "ko", "id", "th", "vi"])
    .default("auto"),
  outputFormat: z.enum(["txt", "srt", "vtt"]).default("txt"),
});

const OUTPUT_CONTENT_TYPES: Record<string, string> = {
  txt: "text/plain",
  srt: "application/x-subrip",
  vtt: "text/vtt",
};

// -- AI job handler (runs inside the BullMQ worker) --
registerAiJobHandler("transcribe-audio", async (input, data, ctx) => {
  const settings = settingsSchema.parse(data.settings);

  ctx.report(5, "Preparing audio");

  // Write the input buffer to a temp file (transcribeAudio needs a file path)
  const audioDir = join(ctx.scratchDir, "audio");
  await mkdir(audioDir, { recursive: true });
  const audioPath = join(audioDir, data.filename);
  await writeFile(audioPath, input);

  ctx.report(10, "Transcribing audio");

  const result = await transcribeAudio(
    audioPath,
    { language: settings.language },
    (percent, stage) => ctx.report(percent, stage),
  );

  // Adapt bridge segments to the api-side TranscriptSegment shape (identical structure).
  const segments: TranscriptSegment[] = result.segments.map((seg) => ({
    startS: seg.startS,
    endS: seg.endS,
    text: seg.text,
  }));

  const base = data.filename.replace(/\.[^.]+$/, "");
  const ext = settings.outputFormat;
  const outName = `${base}.${ext}`;

  let content: string;
  if (ext === "srt") {
    content = toSrt(segments);
  } else if (ext === "vtt") {
    content = toVtt(segments);
  } else {
    content = result.text;
  }

  return {
    buffer: Buffer.from(content, "utf-8"),
    filename: outName,
    contentType: OUTPUT_CONTENT_TYPES[ext],
    resultPayload: {
      language: result.language,
      segments: segments.length,
    },
  };
});

export function registerTranscribeAudio(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/audio/transcribe-audio",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const toolId = "transcribe-audio";
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
      let filename = "audio";
      let settingsRaw: string | null = null;
      let clientJobId: string | null = null;
      let fileId: string | null = null;
      let saveModeRaw: string | null = null;
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
          } else if (part.fieldname === "saveMode") {
            saveModeRaw = part.value as string;
          }
        }
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to parse multipart request",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      const saveMode = parseSaveModeField(saveModeRaw);
      if (saveMode === null) {
        return reply.status(400).send({ error: INVALID_SAVE_MODE_ERROR });
      }

      if (!inputKey) {
        return reply.status(400).send({ error: "No audio file provided" });
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
        saveMode,
        kind: "ai-tool",
      });

      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    },
  );
}
