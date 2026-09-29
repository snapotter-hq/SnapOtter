import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { logErrorWithCauses } from "../../../apps/api/src/lib/log-error-with-causes.js";

/** A real pino logger whose lines land in `lines`, parsed. */
function capturingLogger(serializers?: pino.LoggerOptions["serializers"]) {
  const lines: Record<string, unknown>[] = [];
  const log = pino({ serializers }, { write: (line: string) => lines.push(JSON.parse(line)) });
  return { log: log as unknown as FastifyBaseLogger, lines };
}

/** The shape handoffInstalledOcrRuntime throws when commit and rollback both fail. */
function handoffAndRollbackFailure(): Error {
  const commitFailedTwice = new AggregateError(
    [new Error("commit write failed"), new Error("commit write failed again")],
    "OCR runtime activation commit failed twice",
  );
  const rollbackError = Object.assign(new Error("runtime state unavailable"), { code: "EACCES" });
  return new Error("OCR runtime handoff failed and activation rollback also failed", {
    cause: new AggregateError([commitFailedTwice, rollbackError]),
  });
}

describe("logErrorWithCauses (#1504)", () => {
  it("keeps every AggregateError member that the default err serializer drops", () => {
    const { log, lines } = capturingLogger();

    logErrorWithCauses(
      log,
      { err: handoffAndRollbackFailure(), bundleId: "ocr" },
      "[ocr-runtime] OCR install failed",
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 50,
      msg: "[ocr-runtime] OCR install failed",
      bundleId: "ocr",
      err: {
        message: "OCR runtime handoff failed and activation rollback also failed",
        cause: {
          type: "AggregateError",
          aggregateErrors: [
            {
              message: "OCR runtime activation commit failed twice",
              aggregateErrors: [
                { message: "commit write failed" },
                { message: "commit write failed again" },
              ],
            },
            { message: "runtime state unavailable", code: "EACCES" },
          ],
        },
      },
    });
  });

  it("overrides an err serializer already set on the logger, as Fastify's request loggers have", () => {
    const { log, lines } = capturingLogger({ err: pino.stdSerializers.err });

    logErrorWithCauses(log, { err: handoffAndRollbackFailure() }, "Offline feature import failed");

    const err = lines[0]?.err as { cause?: { aggregateErrors?: unknown[] } } | undefined;
    expect(err?.cause?.aggregateErrors).toHaveLength(2);
  });

  it("falls back to the default serializer when the cause chain can't be walked", () => {
    // errWithCause tags every error it visits, so a frozen one in the chain
    // throws, and an AggregateError that lists itself recurses until the
    // stack runs out. Either would otherwise take the caller's catch with it.
    const frozenCause = new Error("top", { cause: Object.freeze(new Error("frozen cause")) });
    const selfListing = new AggregateError([], "lists itself");
    selfListing.errors.push(selfListing);
    const selfListingCause = new Error("top", { cause: selfListing });

    for (const err of [frozenCause, selfListingCause]) {
      const { log, lines } = capturingLogger();

      expect(() => logErrorWithCauses(log, { err, bundleId: "ocr" }, "failed")).not.toThrow();

      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatchObject({
        msg: "failed",
        bundleId: "ocr",
        err: { message: expect.stringMatching(/^top/) },
        causeChainError: expect.any(String),
      });
    }
  });

  it("leaves the logger it was given alone", () => {
    const { log, lines } = capturingLogger();

    logErrorWithCauses(log, { err: handoffAndRollbackFailure() }, "first");
    log.error({ err: handoffAndRollbackFailure() }, "second");

    // The plain call still uses pino's default err serializer: no cause object.
    const plain = lines[1]?.err as Record<string, unknown> | undefined;
    expect(plain).toBeDefined();
    expect(plain?.cause).toBeUndefined();
  });
});
