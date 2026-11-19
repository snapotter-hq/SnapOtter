import { CONVERT_CASE_MAX_CHARS } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { CASE_MODES, convertCase } from "../../lib/convert-case.js";
import { formatZodErrors } from "../../lib/errors.js";

// JSON can spell one character as a six-byte \uXXXX escape (or twelve for a
// surrogate pair, which is two characters), so allow six bytes per character
// plus room for the other fields. The global limit is the upload size, which
// is far too generous for a text box.
const BODY_LIMIT_BYTES = CONVERT_CASE_MAX_CHARS * 6 + 64 * 1024;

function isLocaleTag(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

const bodySchema = z.object({
  text: z.string().min(1).max(CONVERT_CASE_MAX_CHARS),
  mode: z.enum(CASE_MODES),
  locale: z.string().max(64).refine(isLocaleTag, "Not a valid BCP 47 locale tag").optional(),
});

/**
 * Text case converter: custom route (not factory) because it takes a JSON body
 * and answers with the converted text instead of a file to download.
 */
export function registerConvertCase(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/files/convert-case",
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const { text, mode, locale } = parsed.data;
      return reply.send({ mode, result: convertCase(text, mode, locale) });
    },
  );
}
