import { describe, expect, it } from "vitest";
import {
  buildFeedbackGithubUrl,
  buildFeedbackMailtoUrl,
  SNAPOTTER_FEEDBACK_EMAIL,
} from "@/lib/feedback";

describe("buildFeedbackGithubUrl", () => {
  it("targets the feedback issue template and prefills the message", () => {
    const url = buildFeedbackGithubUrl("The export button is slow");
    expect(url).toContain("https://github.com/snapotter-hq/snapotter/issues/new");
    expect(url).toContain("template=feedback.yml");
    // URLSearchParams encodes spaces as "+"
    expect(url).toContain("details=The+export+button+is+slow");
  });

  it("trims and clamps the message to 2000 characters", () => {
    const url = buildFeedbackGithubUrl(`   hi   ${"x".repeat(2100)}`);
    const details = new URL(url).searchParams.get("details") ?? "";
    expect(details.startsWith("hi")).toBe(true);
    expect(details.length).toBeLessThanOrEqual(2000);
  });
});

describe("buildFeedbackMailtoUrl", () => {
  it("builds a mailto to the project address with an encoded body", () => {
    const url = buildFeedbackMailtoUrl("Love the app, one bug");
    expect(url.startsWith(`mailto:${SNAPOTTER_FEEDBACK_EMAIL}`)).toBe(true);
    expect(url).toContain("subject=SnapOtter%20feedback");
    expect(url).toContain("body=Love%20the%20app%2C%20one%20bug");
  });

  it("uses contact@snapotter.com", () => {
    expect(SNAPOTTER_FEEDBACK_EMAIL).toBe("contact@snapotter.com");
  });
});
