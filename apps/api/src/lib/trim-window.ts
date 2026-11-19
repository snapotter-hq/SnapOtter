import { z } from "zod";
import { InputValidationError } from "../modality/contract.js";

/**
 * Shared settings for trim-video and trim-audio. "range" keeps startS..endS;
 * "ends" removes cutStartS from the front and cutEndS from the back, which
 * only resolves against the probed duration, so a batch of files with
 * different lengths can share one setting.
 */
export const trimModeFields = {
  mode: z.enum(["range", "ends"]).default("range"),
  startS: z.number().finite().min(0).default(0),
  endS: z.number().finite().min(0.000001).optional(),
  cutStartS: z.number().finite().min(0).default(0),
  cutEndS: z.number().finite().min(0).default(0),
};

type TrimModeSettings = {
  mode: "range" | "ends";
  startS: number;
  endS?: number;
  cutStartS: number;
  cutEndS: number;
};

export function checkTrimMode(
  s: TrimModeSettings,
  ctx: z.RefinementCtx,
  minWindowS?: number,
): void {
  // Fields from the other mode would be silently dropped, so refuse them and
  // let an API caller find out that only one kind of trim applies.
  if (s.mode === "ends") {
    if (s.endS !== undefined || s.startS !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startS and endS only apply to mode "range"; use cutStartS and cutEndS',
        path: ["mode"],
      });
    }
    if (s.cutStartS + s.cutEndS <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set a time to cut from at least one end",
        path: ["cutStartS"],
      });
    }
    return;
  }
  if (s.cutStartS !== 0 || s.cutEndS !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cutStartS and cutEndS only apply to mode "ends"',
      path: ["mode"],
    });
  }
  if (s.endS === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End is required", path: ["endS"] });
    return;
  }
  if (s.endS <= s.startS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End must be after start",
      path: ["endS"],
    });
    return;
  }
  if (minWindowS !== undefined && s.endS - s.startS < minWindowS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Trim window must be at least ${minWindowS} seconds`,
      path: ["endS"],
    });
  }
}

/** Turns validated settings into the absolute window to keep, given the probed duration. */
export function resolveTrimWindow(
  s: TrimModeSettings,
  durationS: number,
  noun: "video" | "audio",
): { startS: number; endS: number } {
  if (s.mode === "ends") {
    const endS = durationS - s.cutEndS;
    if (endS <= s.cutStartS) {
      throw new InputValidationError(
        `Cutting ${s.cutStartS}s from the start and ${s.cutEndS}s from the end means nothing of the ${noun} is left`,
      );
    }
    return { startS: s.cutStartS, endS };
  }
  if (s.startS >= durationS) {
    throw new InputValidationError(`Start is beyond the end of the ${noun}`);
  }
  // checkTrimMode guarantees endS in range mode.
  return { startS: s.startS, endS: Math.min(s.endS as number, durationS) };
}
