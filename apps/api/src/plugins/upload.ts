import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { multipartParts } from "../lib/multipart-parts.js";

export async function registerUpload(app: FastifyInstance): Promise<void> {
  await app.register(multipart, {
    limits: {
      fileSize: env.MAX_UPLOAD_SIZE_MB > 0 ? env.MAX_UPLOAD_SIZE_MB * 1024 * 1024 : undefined,
      files: env.MAX_BATCH_SIZE > 0 ? env.MAX_BATCH_SIZE : undefined,
    },
  });

  // Swap the plugin's request.parts() for a busboy-driven iterator
  // (lib/multipart-parts.ts). The plugin's iterator ends when the REQUEST
  // stream closes, which on a reused keep-alive connection fires while an
  // earlier part is still streaming to storage, silently dropping every part
  // behind it (the object eraser lost its mask file on the second POST per
  // connection; dropped trailing settings fields were papered over by a
  // recovery workaround in tool-factory). request.file() callers
  // (features.ts, files.ts) stay on the plugin: the first part is always
  // emitted before the premature end marker can be queued, and field values
  // are recovered from busboy's side map.
  app.addHook("preValidation", async (request) => {
    if (request.isMultipart()) {
      const fixedParts = ((options?: Parameters<typeof request.parts>[0]) =>
        multipartParts(request, {
          fileSize: options?.limits?.fileSize,
          files: options?.limits?.files,
        })) as unknown as typeof request.parts;
      (request as { parts: typeof request.parts }).parts = fixedParts;
    }
  });
}
