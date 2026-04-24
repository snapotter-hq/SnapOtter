import { isConsentEnabled, shouldShowConsent } from "@snapotter/shared";
import { describe, expect, it } from "vitest";

describe("shouldShowConsent", () => {
  it("returns false when server has analytics disabled", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: null,
          analyticsConsentShownAt: null,
          analyticsConsentRemindAt: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("returns true for a fresh user who has never been asked", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: null,
          analyticsConsentShownAt: null,
          analyticsConsentRemindAt: null,
        },
        true,
      ),
    ).toBe(true);
  });

  it("returns false when user already opted in", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: true,
          analyticsConsentShownAt: Date.now(),
          analyticsConsentRemindAt: null,
        },
        true,
      ),
    ).toBe(false);
  });

  it("returns false when user explicitly declined", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: false,
          analyticsConsentShownAt: Date.now(),
          analyticsConsentRemindAt: null,
        },
        true,
      ),
    ).toBe(false);
  });

  it("returns false when remind-at is in the future", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: null,
          analyticsConsentShownAt: Date.now() - 86400000,
          analyticsConsentRemindAt: Date.now() + 86400000,
        },
        true,
      ),
    ).toBe(false);
  });

  it("returns true when remind-at has passed", () => {
    expect(
      shouldShowConsent(
        {
          analyticsEnabled: null,
          analyticsConsentShownAt: Date.now() - 86400000 * 8,
          analyticsConsentRemindAt: Date.now() - 86400000,
        },
        true,
      ),
    ).toBe(true);
  });
});

describe("isConsentEnabled", () => {
  it("returns false when server disabled", () => {
    expect(
      isConsentEnabled(
        {
          analyticsEnabled: true,
          analyticsConsentShownAt: Date.now(),
          analyticsConsentRemindAt: null,
        },
        false,
      ),
    ).toBe(false);
  });

  it("returns false when user has not consented", () => {
    expect(
      isConsentEnabled(
        {
          analyticsEnabled: null,
          analyticsConsentShownAt: null,
          analyticsConsentRemindAt: null,
        },
        true,
      ),
    ).toBe(false);
  });

  it("returns true when user opted in and server enabled", () => {
    expect(
      isConsentEnabled(
        {
          analyticsEnabled: true,
          analyticsConsentShownAt: Date.now(),
          analyticsConsentRemindAt: null,
        },
        true,
      ),
    ).toBe(true);
  });
});
