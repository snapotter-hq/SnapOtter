// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const submitFeedback = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, accepted: true }));
const apiGet = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, submitFeedback };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/stores/analytics-store", () => ({
  useAnalyticsStore: (
    selector: (state: { config: { enabled: boolean }; configLoaded: boolean }) => unknown,
  ) => selector({ config: { enabled: true }, configLoaded: true }),
}));

import { UsageSurveyOverlay } from "@/components/onboarding/usage-survey-overlay";

afterEach(() => {
  cleanup();
  submitFeedback.mockClear();
  apiGet.mockClear();
  apiPut.mockClear();
  useAuth.mockReset();
});

describe("UsageSurveyOverlay", () => {
  it("renders nothing for a non-admin", () => {
    useAuth.mockReturnValue({ role: "user" });

    render(<UsageSurveyOverlay />);

    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing once already answered or dismissed", async () => {
    useAuth.mockReturnValue({ role: "admin" });
    apiGet.mockResolvedValue({
      settings: { "onboarding.usageSurvey.dismissedAt": "2026-01-01T00:00:00Z" },
    });

    render(<UsageSurveyOverlay />);

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("shows both questions for an admin instance that hasn't answered", async () => {
    useAuth.mockReturnValue({ role: "admin" });
    apiGet.mockResolvedValue({ settings: {} });

    render(<UsageSurveyOverlay />);

    expect(await screen.findByText("How are you using SnapOtter?")).toBeDefined();
    expect(screen.getByText("What matters most to you?")).toBeDefined();
    expect(screen.getByRole("button", { name: /Just me/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("submits the selected answers and records the settings key", async () => {
    useAuth.mockReturnValue({ role: "admin" });
    apiGet.mockResolvedValue({ settings: {} });

    render(<UsageSurveyOverlay />);
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("button", { name: /Small team/ }));
    fireEvent.click(screen.getByRole("button", { name: /Images/ }));
    fireEvent.click(screen.getByRole("button", { name: /PDF\/docs/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-overlay-v1",
        usageType: "team_internal",
        importantAreas: ["images", "pdf_docs"],
      });
    });
    expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
      "onboarding.usageSurvey.answeredAt": expect.any(String),
    });
  });

  it("dismissing writes the dismiss key without submitting feedback", async () => {
    useAuth.mockReturnValue({ role: "admin" });
    apiGet.mockResolvedValue({ settings: {} });

    render(<UsageSurveyOverlay />);
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("button", { name: "Don't ask again" }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
        "onboarding.usageSurvey.dismissedAt": expect.any(String),
      });
    });
    expect(submitFeedback).not.toHaveBeenCalled();
  });
});
