// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

function renderOverlay(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <UsageSurveyOverlay />
    </MemoryRouter>,
  );
}

describe("UsageSurveyOverlay", () => {
  it("renders nothing for a non-admin", () => {
    useAuth.mockReturnValue({ role: "user", mustChangePassword: false });

    renderOverlay();

    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing once already answered or dismissed", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({
      settings: { "onboarding.usageSurvey.dismissedAt": "2026-01-01T00:00:00Z" },
    });

    renderOverlay();

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("shows both questions for an admin instance that hasn't answered", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();

    expect(await screen.findByText("How are you using SnapOtter?")).toBeDefined();
    expect(screen.getByText("What matters most to you?")).toBeDefined();
    expect(screen.getByRole("radio", { name: /Just me/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("submits the selected answers and records the settings key", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Small team/ }));
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

  it("includes install method and friction area when the admin selects them", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Built from source" }));
    fireEvent.change(screen.getByLabelText("Hardest setup area"), {
      target: { value: "docker" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-overlay-v1",
        usageType: "personal",
        importantAreas: [],
        installMethod: "source",
        frictionArea: "docker",
      });
    });
  });

  it("does not resubmit feedback if only the settings write failed on the first attempt", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });
    apiPut.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce({});

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));
    expect(submitFeedback).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(2));
    expect(submitFeedback).toHaveBeenCalledTimes(1);
  });

  it("resubmits feedback if the answer changes after a failed settings write", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });
    apiPut.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce({});

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("radio", { name: /Small team/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(apiPut).toHaveBeenCalledTimes(2));
    expect(submitFeedback).toHaveBeenCalledTimes(2);
    expect(submitFeedback).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ usageType: "team_internal" }),
    );
  });

  it("stays visible and re-enables Continue if the feedback submission itself fails", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });
    submitFeedback.mockRejectedValueOnce(new Error("network error"));

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled(),
    );

    expect(screen.getByText("How are you using SnapOtter?")).toBeDefined();
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("dismissing writes the dismiss key without submitting feedback", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("button", { name: "Don't ask again" }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
        "onboarding.usageSurvey.dismissedAt": expect.any(String),
      });
    });
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("ignores a second dismiss click while the first write is in flight", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });
    let resolveApiPut: (() => void) | undefined;
    apiPut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveApiPut = () => resolve({});
        }),
    );

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    const dismissButton = screen.getByRole("button", { name: "Don't ask again" });
    fireEvent.click(dismissButton);
    fireEvent.click(dismissButton);
    fireEvent.click(dismissButton);

    resolveApiPut?.();

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
        "onboarding.usageSurvey.dismissedAt": expect.any(String),
      });
    });
    expect(apiPut).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when the admin must still change their password", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: true });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing on the change-password route even if mustChangePassword is stale-false", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay("/change-password");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing on the privacy policy route", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay("/privacy");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });
});
