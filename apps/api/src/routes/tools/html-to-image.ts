import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { captureHtml, capturePage, isBrowserAvailable } from "../../lib/browser-service.js";
import { formatZodErrors, stripInternalPaths } from "../../lib/errors.js";
import { putObject } from "../../lib/object-storage.js";
import { validateFetchUrl } from "../../lib/ssrf.js";

const DEVICE_PRESETS = {
  desktop: { width: 1280, height: 720, isMobile: false },
  tablet: { width: 768, height: 1024, isMobile: false },
  mobile: { width: 375, height: 812, isMobile: true },
} as const;

const settingsSchema = z
  .object({
    url: z.string().url().optional(),
    html: z.string().min(1).max(5_000_000).optional(),
    format: z.enum(["jpg", "png", "webp"]).default("png"),
    quality: z.number().min(1).max(100).default(90),
    fullPage: z.boolean().default(false),
    devicePreset: z.enum(["desktop", "tablet", "mobile", "custom"]).default("desktop"),
    viewportWidth: z.number().min(320).max(3840).default(1280),
    viewportHeight: z.number().min(320).max(2160).default(720),
  })
  .refine((data) => data.url || data.html, {
    message: "Either url or html must be provided",
    path: ["url"],
  })
  .refine((data) => !(data.url && data.html), {
    message: "Provide either url or html, not both",
    path: ["url"],
  });

export function registerHtmlToImage(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/html-to-image",
    {
      config: {
        rateLimit: { max: 120, timeWindow: "1 hour" },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = settingsSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }

      const settings = parsed.data;

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
            details: err instanceof Error ? err.message : "URL validation failed",
          });
        }
      }

      const preset =
        settings.devicePreset !== "custom"
          ? DEVICE_PRESETS[settings.devicePreset]
          : {
              width: settings.viewportWidth,
              height: settings.viewportHeight,
              isMobile: false,
            };

      try {
        const captureOpts = {
          format: settings.format,
          quality: settings.quality,
          fullPage: settings.fullPage,
          viewportWidth: preset.width,
          viewportHeight: preset.height,
          isMobile: preset.isMobile,
        };

        // Zod refine guarantees either url or html is present
        const buffer = settings.html
          ? await captureHtml(settings.html, captureOpts)
          : await capturePage(settings.url ?? "", captureOpts);

        const jobId = randomUUID();
        const ext = settings.format;
        const filename = `screenshot.${ext}`;
        await putObject(`outputs/${jobId}/${filename}`, buffer);

        return reply.send({
          jobId,
          downloadUrl: `/api/v1/download/${jobId}/${filename}`,
          originalSize: 0,
          processedSize: buffer.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";

        if (message.includes("Timeout") || message.includes("timeout")) {
          return reply.status(504).send({
            error: "Page took too long to load",
            details: stripInternalPaths(message),
          });
        }

        if (
          message.includes("permanently disabled") ||
          message.includes("temporarily unavailable")
        ) {
          return reply.status(503).send({
            error: "Screenshot service is temporarily unavailable",
            code: "BROWSER_CRASHED",
          });
        }

        return reply.status(422).send({
          error: "Screenshot capture failed",
          details: stripInternalPaths(message),
        });
      }
    },
  );
}
