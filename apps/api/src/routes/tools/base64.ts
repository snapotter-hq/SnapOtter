import { BASE64_TEXT_MAX_CHARS } from "@snapotter/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  DECODED_DATA_NOT_TEXT,
  decodeBase64Text,
  encodeBase64Text,
} from "../../lib/base64-text.js";
import { formatZodErrors } from "../../lib/errors.js";

// JSON can spell one character as a six-byte \uXXXX escape (or twelve for a
// surrogate pair, which is two characters), so allow six bytes per character
// plus room for the other fields. The global limit is the upload size, which
// is far too generous for a text box.
const BODY_LIMIT_BYTES = BASE64_TEXT_MAX_CHARS * 6 + 64 * 1024;

const bodySchema = z.object({
  text: z.string().min(1).max(BASE64_TEXT_MAX_CHARS),
  mode: z.enum(["encode", "decode"]),
  urlSafe: z.boolean().default(false),
});

/**
 * Base64 text encoder/decoder: custom route (not factory) because it takes a
 * JSON body and answers with the converted text instead of a file to download.
 */
export function registerBase64(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/files/base64",
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const { text, mode, urlSafe } = parsed.data;

      if (mode === "encode") {
        return reply.send({ mode, result: encodeBase64Text(text, urlSafe) });
      }

      const decoded = decodeBase64Text(text);
      if (!decoded.ok) {
        return reply.status(400).send({
          error:
            decoded.code === DECODED_DATA_NOT_TEXT
              ? "The Base64 input decodes to binary data, not UTF-8 text"
              : "The input is not valid Base64",
          code: decoded.code,
        });
      }
      return reply.send({ mode, result: decoded.text });
    },
  );
}
