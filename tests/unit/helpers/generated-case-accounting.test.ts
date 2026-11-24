import { describe, expect, it } from "vitest";
import {
  featureUnavailableDisposition,
  GeneratedCaseAccounting,
  isEngineUnavailableFailure,
  isRecordedRejection,
  requiredAiGate,
} from "../../helpers/generated-case-accounting.js";

describe("isEngineUnavailableFailure", () => {
  // The lean docker test image skips binary-gated tools by design, so every
  // spawn engine gates the same way ffmpeg does: a missing binary is a skip,
  // not a product failure. A real crash (exit code + stderr) still fails.
  it.each([
    "ffmpeg binary not found (set FFMPEG_PATH or install ffmpeg)",
    "pdfcpu binary not found (set PDFCPU_PATH or install pdfcpu)",
    "soffice binary not found (set SOFFICE_PATH or install LibreOffice)",
    // seamCarve's own wording, which content-aware-resize jobs fail with on a
    // host without caire (#4987).
    "caire binary not found. Install via: go install github.com/esimov/caire/cmd/caire@v1.5.0",
  ])("treats a missing-binary message as engine-unavailable: %s", (message) => {
    expect(isEngineUnavailableFailure(new Error(message))).toBe(true);
  });

  it.each(["spawn pandoc ENOENT", "spawn /usr/local/bin/pdfcpu ENOENT", "spawn soffice ENOENT"])(
    "treats a spawn ENOENT for a known engine as engine-unavailable: %s",
    (message) => {
      expect(isEngineUnavailableFailure(new Error(message))).toBe(true);
    },
  );

  // The worker replaces a spawn failure with this fixed sentence and keeps the
  // program name in the cause, so an async job's terminal payload has neither
  // the binary name nor ENOENT in it. Without this, the lean docker lane fails
  // the epub-convert cases instead of skipping them (#4099).
  it("treats the worker's sanitized engine-unavailable payload as engine-unavailable", () => {
    expect(
      isEngineUnavailableFailure(
        new Error(
          "epub-convert: completed job job-1 returned a failure payload: " +
            "Processing is unavailable on this server because a required engine binary could not be started.",
        ),
      ),
    ).toBe(true);
  });

  it("keeps a real processing crash a failure", () => {
    expect(
      isEngineUnavailableFailure(new Error("pdfcpu exited with code 1: invalid page range")),
    ).toBe(false);
  });
});

describe("GeneratedCaseAccounting", () => {
  it("fails a tool that executes no generated cases", () => {
    const accounting = new GeneratedCaseAccounting("resize");

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated coverage incomplete (attempted=0, accepted=0, rejected=0, skipped=0)",
    );
  });

  it("fails a tool whose generated cases are all rejected", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();
    accounting.reject();

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated coverage incomplete (attempted=1, accepted=0, rejected=1, skipped=0)",
    );
  });

  it("reports accepted and rejected cases after proving coverage", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();
    accounting.accept();
    accounting.attempt();
    accounting.reject();

    expect(accounting.assertCovered()).toEqual({
      attempted: 2,
      accepted: 1,
      rejected: 1,
      skipped: 0,
      skips: [],
    });
  });

  it("records bounded machine-readable skip categories and reasons", () => {
    const accounting = new GeneratedCaseAccounting("remove-background");
    accounting.attempt();
    accounting.skip("optional-feature", "background-removal bundle is not installed");
    accounting.attempt();
    accounting.accept();

    expect(accounting.assertCovered()).toEqual({
      attempted: 2,
      accepted: 1,
      rejected: 0,
      skipped: 1,
      skips: [
        {
          category: "optional-feature",
          reason: "background-removal bundle is not installed",
          count: 1,
        },
      ],
    });
  });

  it("rejects impossible accounting where accepted exceeds attempted", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();
    accounting.accept();
    accounting.accept();

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated accounting is not conserved (attempted=1, accepted=2, rejected=0, skipped=0)",
    );
  });

  it("rejects campaigns with no accepted case even when all attempts have outcomes", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    for (let index = 0; index < 99; index += 1) {
      accounting.attempt();
      accounting.reject();
    }
    accounting.attempt();
    accounting.skip("missing-fixture", "one optional fixture was unavailable");

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated coverage incomplete (attempted=100, accepted=0, rejected=99, skipped=1)",
    );
  });

  it("rejects an unbounded or unknown skip reason", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();

    expect(() =>
      accounting.skip("missing-fixture", `fixture unavailable: ${"x".repeat(300)}`),
    ).toThrow("resize: generated skip reason must be 1-240 characters");
  });
});

describe("featureUnavailableDisposition", () => {
  it("turns an absent optional AI prerequisite into an explicit skip", () => {
    expect(
      featureUnavailableDisposition({
        toolId: "remove-background",
        statusCode: 501,
        code: "FEATURE_NOT_INSTALLED",
        requireAiFeatures: false,
      }),
    ).toBe("skip");
  });

  it("fails a missing AI feature in an installed-feature campaign", () => {
    expect(() =>
      featureUnavailableDisposition({
        toolId: "remove-background",
        statusCode: 501,
        code: "FEATURE_NOT_INSTALLED",
        requireAiFeatures: true,
      }),
    ).toThrow("remove-background: required AI feature returned 501 FEATURE_NOT_INSTALLED");
  });

  it("does not classify unrelated responses as prerequisite skips", () => {
    expect(
      featureUnavailableDisposition({
        toolId: "resize",
        statusCode: 422,
        code: "PROCESSING_FAILED",
        requireAiFeatures: false,
      }),
    ).toBe("continue");
  });
});

describe("isRecordedRejection", () => {
  const ALLOWED = new Set([200, 202, 400, 413, 415, 422]);

  // A long tool answers 202, so its refusal of a bad file only shows up on the
  // failed job row. pdf-to-word refusing a scanned PDF is the case that turned
  // the format matrix red (#5038).
  it("counts a failed job the worker recorded as a 422 as a rejection", () => {
    expect(
      isRecordedRejection(
        {
          status: "failed",
          error: { message: "no text layer", httpStatus: 422, code: "NO_TEXT_LAYER" },
        },
        ALLOWED,
      ),
    ).toBe(true);
  });

  it.each([400, 413, 415])("counts a recorded %i as a rejection", (httpStatus) => {
    expect(isRecordedRejection({ status: "failed", error: { httpStatus } }, ALLOWED)).toBe(true);
  });

  it.each([
    ["a server fault", { status: "failed", error: { httpStatus: 500 } }],
    ["a 4xx the matrix does not allow", { status: "failed", error: { httpStatus: 409 } }],
    [
      "an allowed status that is not a client fault",
      { status: "failed", error: { httpStatus: 200 } },
    ],
    ["a failure with no recorded status", { status: "failed", error: { message: "boom" } }],
    ["a failure with no error at all", { status: "failed", error: null }],
    ["a job that did not fail", { status: "completed", error: { httpStatus: 422 } }],
    ["a canceled job", { status: "canceled", error: { httpStatus: 422 } }],
    ["a missing row", undefined],
  ])("does not count %s as a rejection", (_label, row) => {
    expect(isRecordedRejection(row, ALLOWED)).toBe(false);
  });
});

describe("requiredAiGate", () => {
  const installed = () => null;
  const missing = () => "background-removal";

  it("skips an AI tool in an ordinary run, installed or not", () => {
    for (const firstMissingBundle of [installed, missing]) {
      expect(
        requiredAiGate("remove-background", {
          requireAiFeatures: false,
          firstMissingBundle,
          dataDir: "/data",
        }),
      ).toEqual({
        kind: "skip",
        reason:
          "remove-background: optional AI prerequisite absent; set REQUIRE_AI_FEATURES=1 after install",
      });
    }
  });

  it("runs an AI tool whose bundles are installed in the strict lane", () => {
    expect(
      requiredAiGate("remove-background", {
        requireAiFeatures: true,
        firstMissingBundle: installed,
        dataDir: "/srv/ai-data",
      }),
    ).toEqual({ kind: "run" });
  });

  // The strict lane exists to prove the bundles work. A host whose DATA_DIR
  // lacks one must fail and say which bundle and where it looked, not skip or
  // pass on a pile of anonymous 501s.
  it("fails the strict lane when a required bundle is missing, naming it and the DATA_DIR", () => {
    expect(
      requiredAiGate("remove-background", {
        requireAiFeatures: true,
        firstMissingBundle: missing,
        dataDir: "/srv/ai-data",
      }),
    ).toEqual({
      kind: "fail",
      reason:
        'remove-background: REQUIRE_AI_FEATURES=1 but bundle "background-removal" is not installed in DATA_DIR=/srv/ai-data',
    });
  });

  it("says DATA_DIR is unset when the strict lane runs without one", () => {
    const gate = requiredAiGate("remove-background", {
      requireAiFeatures: true,
      firstMissingBundle: missing,
      dataDir: undefined,
    });
    expect(gate.kind).toBe("fail");
    expect(gate.kind === "fail" && gate.reason).toContain("DATA_DIR=(unset)");
  });
});
