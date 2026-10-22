import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pdfSignPy } from "@snapotter/doc-engine";
import type { SignPlacement } from "@snapotter/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db, schema } from "../../db/index.js";
import { registerAiJobHandler } from "../../jobs/ai-handlers.js";
import { enqueueToolJob, insertToolJobAlias, waitForJob } from "../../jobs/enqueue.js";
import {
  INVALID_CLIENT_JOB_ID_ERROR,
  INVALID_SAVE_MODE_ERROR,
  parseClientJobIdField,
  parseSaveModeField,
  type ToolJobData,
} from "../../jobs/types.js";
import { reportEngineUnavailable } from "../../lib/engine-unavailable.js";
import { stripInternalPaths } from "../../lib/errors.js";
import { validateImageBuffer } from "../../lib/file-validation.js";
import { createUniqueNamer } from "../../lib/filename.js";
import { multipartFailure } from "../../lib/multipart-parts.js";
import {
  getObjectBuffer,
  isStorageServiceFault,
  normalizeS3ReadFault,
} from "../../lib/object-storage.js";
import {
  discardUnenqueuedUploads,
  hasPersistedJobRow,
  settleUnenqueuedAlias,
} from "../../lib/upload-cleanup.js";
import { receiveUpload } from "../../lib/upload-stream.js";
import { InputValidationError } from "../../modality/contract.js";
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
    let clientJobIdRaw: string | null = null;
    let fileId: string | null = null;
    let saveModeRaw: string | null = null;
    let placementsRaw: string | null = null;
    const sigParts: Array<{ index: number; key: string }> = [];
    const uniqueName = createUniqueNamer();

    try {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          const m = part.fieldname.match(SIG_FIELD);
          if (m) {
            if (sigParts.length >= MAX_SIGS) {
              part.file.resume();
              continue;
            }
            const upload = await receiveUpload(part, jobId, { uniqueName });
            sigParts.push({ index: Number(m[1]), key: upload.key });
          } else {
            const upload = await receiveUpload(part, jobId, { uniqueName });
            pdfKey = upload.key;
            filename = upload.filename;
          }
        } else if (part.fieldname === "placements") {
          placementsRaw = part.value as string;
        } else if (part.fieldname === "clientJobId") {
          clientJobIdRaw = part.value as string;
        } else if (part.fieldname === "fileId") {
          fileId = part.value as string;
        } else if (part.fieldname === "saveMode") {
          saveModeRaw = part.value as string;
        }
      }
    } catch (err) {
      await discardUnenqueuedUploads(jobId, request.log);
      const failure = multipartFailure(err);
      return reply.status(failure.status).send(failure.body);
    }

    let enqueued = false;
    let aliasStamped = false;
    try {
      const clientJobIdField = parseClientJobIdField(clientJobIdRaw);
      if (clientJobIdField === null) {
        return reply.status(400).send({ error: INVALID_CLIENT_JOB_ID_ERROR });
      }
      clientJobId = clientJobIdField ?? null;

      // Stamp the client-facing alias before any pre-enqueue work (#892): a
      // cancel landing between parse and enqueueToolJob needs a durable pointer
      // to resolve. Insert-only; enqueueToolJob re-points it at enqueue (#886).
      if (clientJobId && clientJobId !== jobId) {
        aliasStamped =
          (await insertToolJobAlias({ jobId, clientJobId, userId, pool: "docs" })) !== false;
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

      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await getObjectBuffer(pdfKey);
      } catch (err) {
        if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
        throw err;
      }
      try {
        // Signing needs a readable PDF; reject encrypted ones up front (the
        // "unlock first" guidance rides in details) with the same policy the
        // factory gives other PDF-only tools, instead of failing in the worker.
        await inputHandlerFor("document").prepare(pdfBuffer, filename, {
          scratchDir: tmpdir(),
          rejectPasswordProtected: true,
        });
      } catch (err) {
        // A broken qpdf is the server's fault, not a bad document: keep its 503,
        // code, and operator hint, and report it (#1403).
        if (err instanceof InputValidationError && err.statusCode >= 500) {
          reportEngineUnavailable(err, TOOL_ID, request.log);
          return reply.status(err.statusCode).send({
            error: err.message,
            ...(err.details && { details: err.details }),
            ...(err.code && { code: err.code }),
          });
        }
        return reply.status(400).send({
          error: "Invalid PDF",
          details: stripInternalPaths(err instanceof Error ? err.message : String(err)),
        });
      }

      const orderedSigKeys: string[] = [];
      for (const s of [...sigParts].sort((a, b) => a.index - b.index)) {
        let buf: Buffer;
        try {
          buf = await getObjectBuffer(s.key);
        } catch (err) {
          if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
          throw err;
        }
        const v = await validateImageBuffer(buf, `sig${s.index}.png`);
        if (!v.valid) {
          return reply.status(400).send({ error: `Invalid signature image: ${v.reason}` });
        }
        orderedSigKeys.push(s.key);
      }

      enqueued = true;
      const jobData: ToolJobData = {
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
      };
      try {
        await enqueueToolJob(jobData);
        clientJobId = jobData.clientJobId ?? null;
      } catch (err) {
        if (!(await hasPersistedJobRow(jobId, request.log))) enqueued = false;
        throw err;
      }
    } finally {
      if (!enqueued) {
        await discardUnenqueuedUploads(jobId, request.log);
        if (aliasStamped) {
          await settleUnenqueuedAlias(jobId, clientJobId, request.log);
        }
      }
    }

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
      if (err instanceof Error && err.message === "Canceled") {
        const wasCanceled = await db
          .select({ status: schema.jobs.status })
          .from(schema.jobs)
          .where(eq(schema.jobs.id, jobId))
          .then((rows) => rows[0]?.status === "canceled")
          .catch((readErr) => {
            request.log.warn({ err: readErr, jobId }, "canceled job status read failed");
            return false;
          });
        if (wasCanceled) {
          return reply.status(422).send({ error: "Canceled", canceled: true });
        }
      }
      const failure = await db
        .select({ error: schema.jobs.error })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, jobId))
        .then((rows) => rows[0]?.error ?? null)
        .catch((readErr) => {
          request.log.warn({ err: readErr, jobId }, "failed job row read failed");
          return null;
        });
      if (typeof failure?.httpStatus === "number") {
        if (failure.httpStatus >= 500) {
          request.log.error({ err, toolId: TOOL_ID }, "sign-pdf processing failed");
        } else {
          request.log.info({ err, toolId: TOOL_ID }, "sign-pdf rejected input");
        }
        const body: Record<string, unknown> = { error: failure.message };
        if (failure.details !== undefined) body.details = failure.details;
        if (failure.code) body.code = failure.code;
        return reply.status(failure.httpStatus).send(body);
      }
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
      ctx.signal.throwIfAborted();
      let buf: Buffer;
      try {
        buf = await getObjectBuffer(data.inputRefs[i]);
      } catch (err) {
        if (isStorageServiceFault(err)) throw normalizeS3ReadFault(err);
        throw err;
      }
      const p = join(dir, `sig${i - 1}.png`);
      await writeFile(p, buf);
      sigPaths.push(p);
    }
    ctx.signal.throwIfAborted();
    ctx.report(20, "stamping");
    await pdfSignPy(inPath, outPath, sigPaths, placements as SignPlacement[], {
      signal: ctx.signal,
    });
    ctx.report(90, "saving");
    const buffer = await readFile(outPath);
    const outName = `${data.filename.replace(/\.[^.]+$/, "")}_signed.pdf`;
    return { buffer, filename: outName, contentType: "application/pdf" };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
