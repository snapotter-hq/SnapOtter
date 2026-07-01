import { describe, expect, it } from "vitest";
import { shouldShowInstallFeedbackCard, shouldShowUsageSurvey } from "@/lib/feedback";

const NOW = new Date("2026-01-15T00:00:00Z").getTime();

describe("shouldShowInstallFeedbackCard", () => {
  it("shows only for admins after analytics config is loaded and enabled", () => {
    expect(
      shouldShowInstallFeedbackCard({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(true);

    expect(
      shouldShowInstallFeedbackCard({
        settings: {},
        role: "user",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallFeedbackCard({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: false,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallFeedbackCard({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: false,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("stays hidden after submit or permanent dismiss", () => {
    expect(
      shouldShowInstallFeedbackCard({
        settings: { "feedback.install.submittedAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallFeedbackCard({
        settings: { "feedback.install.dismissedAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("honors snooze until the stored timestamp expires", () => {
    expect(
      shouldShowInstallFeedbackCard({
        settings: { "feedback.install.snoozedUntil": "2026-01-16T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(false);

    expect(
      shouldShowInstallFeedbackCard({
        settings: { "feedback.install.snoozedUntil": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
        now: NOW,
      }),
    ).toBe(true);
  });
});

describe("shouldShowUsageSurvey", () => {
  it("shows only for admins after analytics config is loaded and enabled", () => {
    expect(
      shouldShowUsageSurvey({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldShowUsageSurvey({
        settings: {},
        role: "user",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: false,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: false,
      }),
    ).toBe(false);
  });

  it("stays hidden after answering or permanently dismissing", () => {
    expect(
      shouldShowUsageSurvey({
        settings: { "onboarding.usageSurvey.answeredAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: { "onboarding.usageSurvey.dismissedAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);
  });
});
