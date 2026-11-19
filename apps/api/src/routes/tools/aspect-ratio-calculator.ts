import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { formatZodErrors } from "../../lib/errors.js";

const MAX_DIMENSION = 1_000_000;
// Decimal places kept when reducing a fractional size such as 8.5 x 11 to a
// whole-number ratio. Beyond this the ratio is noise from float input.
const RATIO_PRECISION = 4;
// Anything smaller would scale to 0 at RATIO_PRECISION and reduce to 0:1 or NaN:NaN.
const MIN_DIMENSION = 10 ** -RATIO_PRECISION;
// Smallest answer two decimals can show, so a tiny unrounded result is not 0.
const MIN_DECIMAL_RESULT = 0.01;

const dimension = z.number().min(MIN_DIMENSION).max(MAX_DIMENSION);

const settingsSchema = z
  .object({
    width: dimension,
    height: dimension,
    newWidth: dimension.optional(),
    newHeight: dimension.optional(),
    round: z.boolean().default(true),
  })
  .refine((s) => s.newWidth === undefined || s.newHeight === undefined, {
    message: "Set newWidth or newHeight, not both",
    path: ["newHeight"],
  });

type AspectRatioSettings = z.infer<typeof settingsSchema>;

export interface AspectRatioResult {
  width: number;
  height: number;
  ratio: string;
  ratioDecimal: number;
  newWidth: number | null;
  newHeight: number | null;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function decimalPlaces(n: number): number {
  const [, fraction = ""] = String(n).split(".");
  return Math.min(fraction.length, RATIO_PRECISION);
}

function simplifiedRatio(width: number, height: number): string {
  const scale = 10 ** Math.max(decimalPlaces(width), decimalPlaces(height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const divisor = gcd(w, h);
  return `${w / divisor}:${h / divisor}`;
}

function toPrecision(value: number, round: boolean): number {
  // An answer of 0 is never usable, so a tiny result floors at the smallest
  // value each precision can show.
  if (round) return Math.max(1, Math.round(value));
  return Math.max(MIN_DECIMAL_RESULT, Math.round(value * 100) / 100);
}

export function calculateAspectRatio(settings: AspectRatioSettings): AspectRatioResult {
  const { width, height, newWidth, newHeight, round } = settings;
  let solvedWidth: number | null = null;
  let solvedHeight: number | null = null;
  if (newWidth !== undefined) {
    solvedWidth = newWidth;
    solvedHeight = toPrecision((newWidth * height) / width, round);
  } else if (newHeight !== undefined) {
    solvedWidth = toPrecision((newHeight * width) / height, round);
    solvedHeight = newHeight;
  }
  return {
    width,
    height,
    ratio: simplifiedRatio(width, height),
    ratioDecimal: Math.round((width / height) * 10_000) / 10_000,
    newWidth: solvedWidth,
    newHeight: solvedHeight,
  };
}

/**
 * Aspect ratio calculator: custom JSON route (not factory) since it takes no
 * file and answers with numbers, not an output file.
 */
export function registerAspectRatioCalculator(app: FastifyInstance) {
  app.post(
    "/api/v1/tools/image/aspect-ratio-calculator",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = settingsSchema.safeParse(request.body);
      if (!result.success) {
        return reply.status(400).send({
          error: "Invalid settings",
          details: formatZodErrors(result.error.issues),
        });
      }
      return reply.send(calculateAspectRatio(result.data));
    },
  );
}
