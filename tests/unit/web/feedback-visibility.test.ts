import { describe, expect, it } from "vitest";
import {
  parseMigrationMarker,
  shouldShowInstallFeedbackCard,
  shouldShowMigrationBanner,
  shouldShowUsageSurvey,
} from "@/lib/feedback";

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
  // The survey now waits for the instance's first successful processing so we
  // ask engaged users, not someone staring at an empty app on first landing.
  const PROCESSED = { "onboarding.firstProcessedAt": "2026-01-14T00:00:00Z" };

  it("shows only for admins after analytics is loaded and enabled, once a processing has completed", () => {
    expect(
      shouldShowUsageSurvey({
        settings: PROCESSED,
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(true);

    expect(
      shouldShowUsageSurvey({
        settings: PROCESSED,
        role: "user",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: PROCESSED,
        role: "admin",
        analyticsConfigLoaded: false,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: PROCESSED,
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: false,
      }),
    ).toBe(false);
  });

  it("stays hidden until the instance's first successful processing", () => {
    expect(
      shouldShowUsageSurvey({
        settings: {},
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);
  });

  it("stays hidden after answering or permanently dismissing, even once processing has happened", () => {
    expect(
      shouldShowUsageSurvey({
        settings: { ...PROCESSED, "onboarding.usageSurvey.answeredAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);

    expect(
      shouldShowUsageSurvey({
        settings: { ...PROCESSED, "onboarding.usageSurvey.dismissedAt": "2026-01-14T00:00:00Z" },
        role: "admin",
        analyticsConfigLoaded: true,
        analyticsEnabled: true,
      }),
    ).toBe(false);
  });
});

describe("shouldShowMigrationBanner", () => {
  const marker = JSON.stringify({
    status: "completed",
    tables: { users: 2, user_files: 1 },
    blobs: { present: 1, missing: 0 },
  });

  it("shows for admins when a marker exists and is not dismissed", () => {
    expect(shouldShowMigrationBanner({ settings: { sqlite_import: marker }, role: "admin" })).toBe(
      true,
    );
  });

  it("is hidden for non-admins even with a marker", () => {
    expect(shouldShowMigrationBanner({ settings: { sqlite_import: marker }, role: "user" })).toBe(
      false,
    );
  });

  it("is hidden once dismissed", () => {
    expect(
      shouldShowMigrationBanner({
        settings: { sqlite_import: marker, "sqlite_import.dismissedAt": "2026-01-14T00:00:00Z" },
        role: "admin",
      }),
    ).toBe(false);
  });

  it("is hidden when there is no marker", () => {
    expect(shouldShowMigrationBanner({ settings: {}, role: "admin" })).toBe(false);
  });
});

describe("parseMigrationMarker", () => {
  it("parses completed and detected_locked markers", () => {
    expect(parseMigrationMarker(JSON.stringify({ status: "completed" }))?.status).toBe("completed");
    expect(parseMigrationMarker(JSON.stringify({ status: "detected_locked" }))?.status).toBe(
      "detected_locked",
    );
  });

  it("returns null for missing, invalid, or unknown-status input", () => {
    expect(parseMigrationMarker(undefined)).toBeNull();
    expect(parseMigrationMarker("not json")).toBeNull();
    expect(parseMigrationMarker(JSON.stringify({ status: "bogus" }))).toBeNull();
  });
});
