import { randomUUID } from "node:crypto";
import { hasServerErrorStatus } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { insertToolJobAlias } from "../../jobs/enqueue.js";
import { INVALID_CLIENT_JOB_ID_ERROR, parseClientJobIdField } from "../../jobs/types.js";
import {
  type CaptureOptions,
  captureHtml,
  capturePage,
  isBrowserAvailable,
} from "../../lib/browser-service.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { putObject } from "../../lib/object-storage.js";
import { resolveToolPool } from "../../lib/pool.js";
import { validateFetchUrl } from "../../lib/ssrf.js";
import { discardUnenqueuedUploads, settleUnenqueuedAlias } from "../../lib/upload-cleanup.js";
import { InputValidationError } from "../../modality/contract.js";
import { requireToolAccess } from "../../permissions.js";
import {
  enqueueAndAwaitToolJob,
  registerDirectJobProcessFn,
  type ToolProcessV2,
} from "../tool-factory.js";

const TOOL_ID = "html-to-image";

const DEVICE_PRESETS = {
  desktop: { width: 1280, height: 720, isMobile: false },
  tablet: { width: 768, height: 1024, isMobile: false },
  mobile: { width: 375, height: 812, isMobile: true },
} as const;

const captureSettingsSchema = z.object({
  url: z.string().url().optional(),
  format: z.enum(["jpg", "png", "webp"]).default("png"),
  quality: z.number().min(1).max(100).default(90),
  fullPage: z.boolean().default(false),
  devicePreset: z.enum(["desktop", "tablet", "mobile", "custom"]).default("desktop"),
  viewportWidth: z.number().min(320).max(3840).default(1280),
  viewportHeight: z.number().min(320).max(2160).default(720),
});

const settingsSchema = captureSettingsSchema
  .extend({
    html: z.string().min(1).max(5_000_000).optional(),
    clientJobId: z.string().optional(),
  })
  .refine((data) => data.url || data.html, {
    message: "Either url or html must be provided",
    path: ["url"],
  })
  .refine((data) => !(data.url && data.html), {
    message: "Provide either url or html, not both",
    path: ["url"],
  });

/** What the job carries: the HTML itself travels as the job's input object. */
export type CaptureSettings = z.infer<typeof captureSettingsSchema>;

const CONTENT_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

/**
 * Render the queued source. A URL capture reads `settings.url`; an HTML capture
 * reads the input object, which holds the HTML the request sent. Failures keep
 * the statuses the inline route answered: 504 for a page that never loaded, 503
 * for a browser that is down, 422 for any other capture failure.
 */
export const processHtmlToImage: ToolProcessV2 = async ({ inputs, settings: raw, report }) => {
  const settings = captureSettingsSchema.parse(raw);
  const preset =
    settings.devicePreset !== "custom"
      ? DEVICE_PRESETS[settings.devicePreset]
      : { width: settings.viewportWidth, height: settings.viewportHeight, isMobile: false };
  const captureOpts: CaptureOptions = {
    format: settings.format,
    quality: settings.quality,
    fullPage: settings.fullPage,
    viewportWidth: preset.width,
    viewportHeight: preset.height,
    isMobile: preset.isMobile,
  };

  report(10, "Loading page");
  let buffer: Buffer;
  try {
    buffer = settings.url
      ? await capturePage(settings.url, captureOpts)
      : await captureHtml(inputs[0].buffer.toString("utf8"), captureOpts);
  } catch (err) {
    if (hasServerErrorStatus(err)) throw err;
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("Timeout") || message.includes("timeout")) {
      throw new InputValidationError(
        "Page took too long to load",
        504,
        stripInternalPaths(message),
      );
    }
    if (message.includes("permanently disabled") || message.includes("temporarily unavailable")) {
      throw new InputValidationError(
        "Screenshot service is temporarily unavailable",
        503,
        undefined,
        "BROWSER_CRASHED",
      );
    }
    throw new InputValidationError("Screenshot capture failed", 422, stripInternalPaths(message));
  }
  report(90, "Saving");

  return {
    buffer,
    filename: `screenshot.${settings.format}`,
    contentType: CONTENT_TYPES[settings.format],
    // Nothing was uploaded, so there is no original to measure. The worker
    // would otherwise report the size of the queued HTML or URL.
    resultPayload: { originalSize: 0 },
  };
};

export function registerHtmlToImage(app: FastifyInstance) {
  registerDirectJobProcessFn(TOOL_ID, processHtmlToImage);

  app.post(
    "/api/v1/tools/image/html-to-image",
    {
      config: {
        rateLimit: { max: 120, timeWindow: "1 hour" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authUser = await requireToolAccess(request, reply, TOOL_ID);
      if (!authUser) return reply;

      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }

      const { html, clientJobId: clientJobIdRaw, ...settings } = parsed.data;

      const clientJobIdField = parseClientJobIdField(clientJobIdRaw ?? null);
      if (clientJobIdField === null) {
        return reply.status(400).send({ error: INVALID_CLIENT_JOB_ID_ERROR });
      }
      const clientJobId = clientJobIdField ?? null;

      if (!isBrowserAvailable()) {
        return reply.status(503).send({
          error: "Screenshot service is not available. Chromium is not installed.",
          code: "BROWSER_NOT_AVAILABLE",
        });
      }

      if (settings.url) {
        try {
          await validateFetchUrl(settings.url);
        } catch (err) {
          return reply.status(400).send({
            error: "URL is not allowed",
            details: stripInternalPaths(
              err instanceof Error ? err.message : "URL validation failed",
            ),
          });
        }
      }

      const jobId = randomUUID();
      const pool = resolveToolPool(TOOL_ID);
      const enqueueState = { enqueued: false };
      let aliasStamped = false;
      try {
        // Stamp the client-facing alias before the upload so a cancel landing
        // before the enqueue has a durable pointer to resolve (#886).
        if (clientJobId && clientJobId !== jobId) {
          aliasStamped =
            (await insertToolJobAlias({ jobId, clientJobId, userId: authUser.id, pool })) !== false;
        }

        // The worker needs an input object, and up to 5 MB of HTML has no
        // business in the job's settings or its database row. A URL capture
        // queues the URL itself so the job still has one.
        const source = html ?? settings.url ?? "";
        const filename = html ? "page.html" : "page.url";
        const inputRef = `uploads/${jobId}/${filename}`;
        await putObject(inputRef, Buffer.from(source, "utf8"));

        return await enqueueAndAwaitToolJob(request, reply, {
          jobData: {
            jobId,
            toolId: TOOL_ID,
            userId: authUser.id,
            username: authUser.username,
            requestIp: request.ip,
            requestId: request.id,
            pool,
            inputRefs: [inputRef],
            filename,
            settings,
            clientJobId: clientJobId ?? undefined,
            kind: "tool",
            analyticsDistinctId: request.headers["x-posthog-distinct-id"] as string | undefined,
          },
          inputFileCount: 0,
          totalInputSize: 0,
          state: enqueueState,
        });
      } finally {
        if (!enqueueState.enqueued) {
          await discardUnenqueuedUploads(jobId, request.log);
          if (aliasStamped) await settleUnenqueuedAlias(jobId, clientJobId, request.log);
        }
      }
    },
  );
}
