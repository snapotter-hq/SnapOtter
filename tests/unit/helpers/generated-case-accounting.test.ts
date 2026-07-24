import { describe, expect, it } from "vitest";
import {
  featureUnavailableDisposition,
  GeneratedCaseAccounting,
} from "../../helpers/generated-case-accounting.js";

describe("GeneratedCaseAccounting", () => {
  it("fails a tool that executes no generated cases", () => {
    const accounting = new GeneratedCaseAccounting("resize");

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated coverage incomplete (attempted=0, accepted=0, rejected=0)",
    );
  });

  it("fails a tool whose generated cases are all rejected", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();
    accounting.reject();

    expect(() => accounting.assertCovered()).toThrow(
      "resize: generated coverage incomplete (attempted=1, accepted=0, rejected=1)",
    );
  });

  it("reports accepted and rejected cases after proving coverage", () => {
    const accounting = new GeneratedCaseAccounting("resize");
    accounting.attempt();
    accounting.accept();
    accounting.attempt();
    accounting.reject();

    expect(accounting.assertCovered()).toEqual({ attempted: 2, accepted: 1, rejected: 1 });
  });

  it("allows an observed prerequisite failure only when explicitly recorded", () => {
    const accounting = new GeneratedCaseAccounting("remove-background");
    accounting.attempt();
    accounting.prerequisiteSkip();

    expect(accounting.assertCovered()).toEqual({ attempted: 1, accepted: 0, rejected: 0 });
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
