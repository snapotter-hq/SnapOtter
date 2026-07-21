import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfSignPy } from "@snapotter/doc-engine";
import type { SignPlacement } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, waitForJob } from "../../jobs/enqueue.js";
import { INVALID_SAVE_MODE_ERROR, parseSaveModeField } from "../../jobs/types.js";
import { stripInternalPaths } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { getObjectBuffer } from "../../lib/object-storage.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { inputHandlerFor } from "../../modality/input-handler.js";
import { getAuthUser } from "../../plugins/auth.js";
import { buildAsyncAcceptedPayload } from "../async-response.js";

const TOOL_ID = "sign-pdf";
const MAX_PLACEMENTS = 100;
const MAX_SIGS = 100;
const SIG_FIELD = /^sig(\d+)$/;

const placementSchema = z.object({
  sig: z.number().int().min(0),
  page: z.number().int().min(0),
  // Page fractions, top-left origin. Off-page bleed is tolerated in every
  // direction (a signature nudged past an edge or sized larger than the page);
  // PyMuPDF clips the rect to the page. Bounded to keep the rect sane.
  x: z.number().min(-2).max(2),
  y: z.number().min(-2).max(2),
  w: z.number().min(0).max(4),
  h: z.number().min(0).max(4),
});
const settingsSchema = z.object({
  placements: z.array(placementSchema).min(1).max(MAX_PLACEMENTS),
});

/**
 * Sign PDF route.
 * Accepts a PDF plus one or more signature PNGs (fieldnames sig0, sig1, ...)
 * and a `placements` field (a JSON array of {sig,page,x,y,w,h} in normalized
 * 0..1 coordinates). Stamps each signature onto the PDF via PyMuPDF.
 *
 * Hand-written route (not createToolRoute): it takes a secondary file part and
 * registers worker logic via registerAiJobHandler, which keeps the tool out of
 * the pipeline/batch process-fn registry. Enqueues to the docs pool with
 * kind "ai-tool"; the worker auto-generates the PDF first-page preview.
 */
export function registerSignPdf(app: FastifyInstance) {
  app.post("/api/v1/tools/pdf/sign-pdf", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getAuthUser(request)?.id ?? null;
    const jobId = randomUUID();
    let pdfKey: string | null = null;
    let filename = "document.pdf";
    let clientJobId: string | null = null;
    let fileId: string | null = null;
    let saveModeRaw: string | null = null;
    let placementsRaw: string | null = null;
    const sigParts: Array<{ index: number; key: string }> = [];

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          const m = part.fieldname.match(SIG_FIELD);
          if (m) {
            if (sigParts.length >= MAX_SIGS) {
              part.file.resume();
              continue;
            }
            const upload = await receiveUpload(part, jobId);
            sigParts.push({ index: Number(m[1]), key: upload.key });
          } else {
            const upload = await receiveUpload(part, jobId);
            pdfKey = upload.key;
            filename = upload.filename;
          }
        } else if (part.fieldname === "placements") {
          placementsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          const raw = part.value as string;
          if (/^[0-9a-f-]{36}$/i.test(raw)) clientJobId = raw;
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

    if (!pdfKey) return reply.status(400).send({ error: "No PDF file provided" });
    if (!placementsRaw) return reply.status(400).send({ error: "No placements provided" });

    let parsed: z.infer<typeof settingsSchema>;
    try {
      parsed = settingsSchema.parse({ placements: JSON.parse(placementsRaw) });
    } catch (err) {
      return reply.status(400).send({
        error: "Invalid placements",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    const sigIndexes = new Set(sigParts.map((s) => s.index));
    for (const p of parsed.placements) {
      if (!sigIndexes.has(p.sig)) {
        return reply
          .status(400)
          .send({ error: `Missing signature image for placement (sig ${p.sig})` });
      }
    }

    const pdfBuffer = await getObjectBuffer(pdfKey);
    try {
      // Signing needs a readable PDF; reject encrypted ones up front (the
      // "unlock first" guidance rides in details) with the same policy the
      // factory gives other PDF-only tools, instead of failing in the worker.
      await inputHandlerFor("document").prepare(pdfBuffer, filename, {
        scratchDir: tmpdir(),
        rejectPasswordProtected: true,
      });
    } catch (err) {
      return reply.status(400).send({
        error: "Invalid PDF",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }

    const orderedSigKeys: string[] = [];
    for (const s of [...sigParts].sort((a, b) => a.index - b.index)) {
      const buf = await getObjectBuffer(s.key);
      const v = await validateImageBuffer(buf, `sig${s.index}.png`);
      if (!v.valid) {
        return reply.status(400).send({ error: `Invalid signature image: ${v.reason}` });
      }
      orderedSigKeys.push(s.key);
    }

    await enqueueToolJob({
      jobId,
      toolId: TOOL_ID,
      userId,
      pool: "docs",
      inputRefs: [pdfKey, ...orderedSigKeys],
      filename,
      settings: { placements: parsed.placements },
      clientJobId: clientJobId ?? undefined,
      fileId: fileId ?? undefined,
      saveMode,
      kind: "ai-tool",
    });

    try {
      const result = await waitForJob("docs", jobId);
      if (result) {
        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${encodeURIComponent(result.filename)}`,
          previewUrl: result.previewRef
            ? `/api/v1/download/${jobId}/${result.previewRef.split("/").pop()}`
            : undefined,
          originalSize: result.originalSize,
          processedSize: result.processedSize,
          savedFileId: result.savedFileId,
        });
      }
      return reply.status(202).send(buildAsyncAcceptedPayload(jobId, clientJobId));
    } catch (err) {
      request.log.error({ err, toolId: TOOL_ID }, "sign-pdf processing failed");
      return reply.status(422).send({
        error: "Processing failed",
        details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
      });
    }
  });
}

registerAiJobHandler(TOOL_ID, async (input, data, ctx) => {
  const { placements } = settingsSchema.parse(data.settings);
  const dir = await mkdtemp(join(ctx.scratchDir, "sign-"));
  try {
    const inPath = join(dir, "in.pdf");
    const outPath = join(dir, "out.pdf");
    await writeFile(inPath, input);
    const sigPaths: string[] = [];
    for (let i = 1; i < data.inputRefs.length; i++) {
      const buf = await getObjectBuffer(data.inputRefs[i]);
      const p = join(dir, `sig${i - 1}.png`);
      await writeFile(p, buf);
      sigPaths.push(p);
    }
    ctx.report(20, "stamping");
    await pdfSignPy(inPath, outPath, sigPaths, placements as SignPlacement[]);
    ctx.report(90, "saving");
    const buffer = await readFile(outPath);
    const outName = `${data.filename.replace(/\.[^.]+$/, "")}_signed.pdf`;
    return { buffer, filename: outName, contentType: "application/pdf" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
