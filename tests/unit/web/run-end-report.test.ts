import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  captureHandledError: vi.fn(async () => null),
}));

import { captureHandledError } from "@/lib/analytics";
import { reportRunEndFailure } from "@/lib/run-end-report";
import { buildWebBeforeSend } from "@/lib/sentry-scrub";

// #1812: a store write that breaks while a run ends is reported as a handled
// bug. What reaches Sentry is the site's constant message, the cause's
// redacted text and fixed tags: never a file name, path or URL.
describe("reportRunEndFailure (#1812)", () => {
  beforeEach(() => {
    vi.mocked(captureHandledError).mockClear();
  });

  it("reports a constant SafeError with the cause attached and the tool tagged", () => {
    const cause = new Error("store broke");
    reportRunEndFailure("Failing a batch run's entries failed", cause, "resize");

    expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(error).toMatchObject({
      name: "SafeError",
      message: "Failing a batch run's entries failed",
      isSafeMessage: true,
      kind: "bug",
    });
    expect(error.cause).toBe(cause);
    expect(tags).toEqual({ error_class: "bug", tool_id: "resize" });
  });

  it("leaves the tool tag off when there is no single tool", () => {
    reportRunEndFailure("Failing a pipeline run's entries failed", new Error("store broke"));

    const [, tags] = vi.mocked(captureHandledError).mock.calls[0];
    expect(tags).toEqual({ error_class: "bug" });
  });

  it("never throws and returns without waiting on the report", () => {
    vi.mocked(captureHandledError).mockImplementationOnce(() => new Promise(() => {}));

    expect(
      reportRunEndFailure("Failing a tool run's entries failed", new Error("x"), "resize"),
    ).toBeUndefined();
  });

  it("masks the user's file, path and URL in what the scrubber sends", () => {
    // A cause whose text names the user's file, a local path and a result URL.
    const cause = new Error(
      "write failed for holiday-alice.jpg from /Users/alice/x at https://snap.example/d/a.png",
    );
    reportRunEndFailure("Failing a sync tool run's entry failed", cause, "trim-video");
    const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];

    // Sentry's linked-errors integration puts the cause first and the
    // reported error last.
    const event = {
      exception: {
        values: [
          { type: "Error", value: cause.message },
          { type: "SafeError", value: error.message },
        ],
      },
      tags,
    };
    const out = buildWebBeforeSend(() => true)(event, { originalException: error });

    // The scrubber rewrites the event in place. The linked cause is
    // type-only; the reported error keeps its constant title, with the
    // cause's redacted text after it for triage.
    expect(out).toBe(event);
    expect(event.exception.values).toEqual([
      { type: "Error", value: "Error" },
      {
        type: "SafeError",
        value:
          "Failing a sync tool run's entry failed: write failed for <file> from <path> at <url>",
      },
    ]);
    expect(event.tags).toEqual({ error_class: "bug", tool_id: "trim-video" });
    expect(JSON.stringify(event)).not.toMatch(/alice|holiday|example/);
  });
});
