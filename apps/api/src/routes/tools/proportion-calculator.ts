import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";
import { PROPORTION_MODES, solveProportion } from "../../lib/proportion.js";

// Three numbers and a mode. The global limit is the upload size, which is far
// too generous for that.
const BODY_LIMIT_BYTES = 16 * 1024;

const bodySchema = z.object({
  a: z.number().finite(),
  b: z.number().finite(),
  c: z.number().finite(),
  mode: z.enum(PROPORTION_MODES).default("direct"),
});

/**
 * Rule-of-three calculator: custom route (not factory) because it takes a JSON
 * body and answers with a number instead of a file to download.
 */
export function registerProportionCalculator(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/files/proportion-calculator",
    { bodyLimit: BODY_LIMIT_BYTES },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(parsed.error.issues),
        });
      }
      const { a, b, c, mode } = parsed.data;
      const solved = solveProportion(a, b, c, mode);
      if (!solved.ok) {
        return reply.status(400).send({
          error:
            solved.reason === "zero-divisor"
              ? mode === "direct"
                ? "a must not be 0 in a direct proportion"
                : "c must not be 0 in an inverse proportion"
              : "The answer is outside the range a number can hold",
        });
      }
      return reply.send({ mode, x: solved.x });
    },
  );
}
