import type { ConsentState } from "@snapotter/shared";
import { isConsentEnabled, shouldShowConsent } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

describe("shouldShowConsent edge cases", () => {
  it("returns true when remindAt is exactly equal to Date.now()", () => {
    const now = Date.now();
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: now - SEVEN_DAYS_MS,
      analyticsConsentRemindAt: now,
    };
    // Date.now() >= remindAt should be true when they are equal
    expect(shouldShowConsent(state, true)).toBe(true);
  });

  it("returns true when remindAt is set but consentShownAt is null (defensive)", () => {
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: Date.now() - 1000,
    };
    // consentShownAt is null -> returns true (fresh user path)
    expect(shouldShowConsent(state, true)).toBe(true);
  });

  it("returns false when remindAt is 1ms in the future", () => {
    const now = Date.now();
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: now - SEVEN_DAYS_MS,
      analyticsConsentRemindAt: now + 100000, // safely in the future
    };
    expect(shouldShowConsent(state, true)).toBe(false);
  });

  it("returns true after 'Maybe later' and 7 days have passed", () => {
    const shownAt = Date.now() - SEVEN_DAYS_MS - 1000;
    const remindAt = Date.now() - 1000; // remind time has passed
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: shownAt,
      analyticsConsentRemindAt: remindAt,
    };
    expect(shouldShowConsent(state, true)).toBe(true);
  });

  it("returns false when server is disabled regardless of remindAt", () => {
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: Date.now() - SEVEN_DAYS_MS,
      analyticsConsentRemindAt: Date.now() - 1000,
    };
    expect(shouldShowConsent(state, false)).toBe(false);
  });
});

describe("isConsentEnabled edge cases", () => {
  it("returns false when analyticsEnabled is false (explicitly declined)", () => {
    const state: ConsentState = {
      analyticsEnabled: false,
      analyticsConsentShownAt: Date.now(),
      analyticsConsentRemindAt: null,
    };
    expect(isConsentEnabled(state, true)).toBe(false);
  });

  it("returns false when analyticsEnabled is null (never decided)", () => {
    const state: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(isConsentEnabled(state, true)).toBe(false);
  });

  it("returns false when server disabled even if user opted in", () => {
    const state: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: Date.now(),
      analyticsConsentRemindAt: null,
    };
    expect(isConsentEnabled(state, false)).toBe(false);
  });
});

describe("consent lifecycle simulations", () => {
  it("fresh -> maybe later -> remind time passes -> show again -> accept", () => {
    // Step 1: Fresh user -- never been asked
    const fresh: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(fresh, true)).toBe(true);
    expect(isConsentEnabled(fresh, true)).toBe(false);

    // Step 2: User clicks "Maybe later" -- shown timestamp set, remind in 7 days
    const shownAt = Date.now() - SEVEN_DAYS_MS - 1000;
    const maybeLater: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: shownAt,
      analyticsConsentRemindAt: shownAt + SEVEN_DAYS_MS,
    };
    // Remind time has now passed (shownAt + 7days < now)
    expect(shouldShowConsent(maybeLater, true)).toBe(true);
    expect(isConsentEnabled(maybeLater, true)).toBe(false);

    // Step 3: User accepts on second prompt
    const accepted: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: Date.now(),
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(accepted, true)).toBe(false);
    expect(isConsentEnabled(accepted, true)).toBe(true);
  });

  it("fresh -> accept immediately -> never show again", () => {
    // Step 1: Fresh user
    const fresh: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(fresh, true)).toBe(true);

    // Step 2: User accepts immediately
    const accepted: ConsentState = {
      analyticsEnabled: true,
      analyticsConsentShownAt: Date.now(),
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(accepted, true)).toBe(false);
    expect(isConsentEnabled(accepted, true)).toBe(true);

    // Verify it stays hidden even far in the future
    expect(shouldShowConsent(accepted, true)).toBe(false);
  });

  it("fresh -> decline immediately -> never show again", () => {
    // Step 1: Fresh user
    const fresh: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(fresh, true)).toBe(true);

    // Step 2: User declines immediately
    const declined: ConsentState = {
      analyticsEnabled: false,
      analyticsConsentShownAt: Date.now(),
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(declined, true)).toBe(false);
    expect(isConsentEnabled(declined, true)).toBe(false);

    // Verify it stays hidden and analytics stays disabled
    expect(shouldShowConsent(declined, true)).toBe(false);
    expect(isConsentEnabled(declined, true)).toBe(false);
  });

  it("fresh -> maybe later -> remind time NOT yet passed -> stay hidden", () => {
    const fresh: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: null,
      analyticsConsentRemindAt: null,
    };
    expect(shouldShowConsent(fresh, true)).toBe(true);

    // User clicks maybe later, only 1 day ago
    const maybeLater: ConsentState = {
      analyticsEnabled: null,
      analyticsConsentShownAt: Date.now() - 86400000,
      analyticsConsentRemindAt: Date.now() + SEVEN_DAYS_MS - 86400000,
    };
    expect(shouldShowConsent(maybeLater, true)).toBe(false);
    expect(isConsentEnabled(maybeLater, true)).toBe(false);
  });
});
