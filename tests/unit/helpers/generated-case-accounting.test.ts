import { describe, expect, it } from "vitest";
import {
  featureUnavailableDisposition,
  GeneratedCaseAccounting,
} from "../../helpers/generated-case-accounting.js";

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
