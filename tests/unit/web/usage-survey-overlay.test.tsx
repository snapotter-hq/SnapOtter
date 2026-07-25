// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const submitFeedback = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, accepted: true }));
const trackFeedbackPromptShown = vi.hoisted(() => vi.fn());
const trackFeedbackPromptDismissed = vi.hoisted(() => vi.fn());
const apiGet = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, submitFeedback, trackFeedbackPromptShown, trackFeedbackPromptDismissed };
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

// The worker writes this marker on the instance's first successful processing.
// The survey is only eligible once it exists; without it the overlay stays hidden.
const PROCESSED = { "onboarding.firstProcessedAt": "2026-01-01T00:00:00Z" };

afterEach(() => {
  cleanup();
  submitFeedback.mockClear();
  trackFeedbackPromptShown.mockClear();
  trackFeedbackPromptDismissed.mockClear();
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

  it("stays hidden until the instance's first processing has completed", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: {} });

    renderOverlay();

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
    expect(trackFeedbackPromptShown).not.toHaveBeenCalled();
  });

  it("renders nothing once already answered or dismissed", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({
      settings: { ...PROCESSED, "onboarding.usageSurvey.dismissedAt": "2026-01-01T00:00:00Z" },
    });

    renderOverlay();

    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("shows the telemetry-blind questions after processing and emits a shown event", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay();

    expect(await screen.findByText("How are you using SnapOtter?")).toBeDefined();
    expect(screen.getByRole("radio", { name: /Just me/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    // Opening ask is one question. The optional three stay collapsed until the
    // required one is answered, so the first impression is not a wall of 20.
    expect(screen.queryByText("What were you using before?")).toBeNull();
    expect(screen.queryByText(/Why self-host it/)).toBeNull();
    await waitFor(() => expect(trackFeedbackPromptShown).toHaveBeenCalledWith("onboarding"));
  });

  it("submits only the usage type when nothing else is picked", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Small team/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-card-v1",
        usageType: "team_internal",
      });
    });
    expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
      "onboarding.usageSurvey.answeredAt": expect.any(String),
    });
  });

  it("includes prior tool, motivation, and discovery source when the admin selects them", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
    // Answering the required question reveals the optional follow-ups.
    expect(await screen.findByText("What were you using before?")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: /Command line/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Privacy and data control/ }));
    fireEvent.change(screen.getByLabelText(/How did you hear about us/), {
      target: { value: "github" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "onboarding",
        surveyId: "onboarding-usage-v1",
        promptVariant: "onboarding-card-v1",
        usageType: "personal",
        priorTool: "command_line",
        selfHostMotivation: "privacy_control",
        discoverySource: "github",
      });
    });
  });

  it("dismissing writes the dismiss key, emits a dismissed event, and does not submit", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay();
    await screen.findByText("How are you using SnapOtter?");

    fireEvent.click(screen.getByRole("button", { name: "Don't ask again" }));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
        "onboarding.usageSurvey.dismissedAt": expect.any(String),
      });
    });
    expect(trackFeedbackPromptDismissed).toHaveBeenCalledWith("onboarding", "dont_ask_again");
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("does not resubmit feedback if only the settings write failed on the first attempt", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });
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

  it("stays visible and re-enables Continue if the feedback submission itself fails", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });
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

  it("ignores a second dismiss click while the first write is in flight", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });
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

  // The prompt used to be an opaque full-screen takeover with aria-modal, a
  // focus trap, and no Escape handler, so the only exits were answering the
  // required question or finding a text-xs grey link. These pin the friction fix.
  describe("does not block the app", () => {
    it("is not a modal and does not cover the screen", async () => {
      useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
      apiGet.mockResolvedValue({ settings: PROCESSED });

      renderOverlay();
      await screen.findByText("How are you using SnapOtter?");

      const dialog = screen.getByRole("dialog");
      expect(dialog).not.toHaveAttribute("aria-modal", "true");
      expect(dialog.className).not.toContain("inset-0");
    });

    it("closes on Escape and records the dismissal", async () => {
      useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
      apiGet.mockResolvedValue({ settings: PROCESSED });

      renderOverlay();
      await screen.findByText("How are you using SnapOtter?");
      await act(async () => {});

      // Escape is the one control here whose handler is a document listener
      // registered by a passive effect; every other control is an onClick prop
      // attached at commit. That makes it the only one that can miss an event
      // dispatched too early, and it flaked exactly once on main: dialog fully
      // rendered, handler never ran. Locally the listener is always attached by
      // the time findByText resolves, so the window only opens under CI
      // contention and cannot be reproduced here. Rather than bet on one
      // mechanism, retry the dispatch until it lands. handleDismiss guards on
      // `busy` and the settings write is idempotent, so repeats are harmless.
      await waitFor(() => {
        fireEvent.keyDown(document, { key: "Escape" });
        expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
          "onboarding.usageSurvey.dismissedAt": expect.any(String),
        });
      });
      expect(trackFeedbackPromptDismissed).toHaveBeenCalledWith("onboarding", "close");
      expect(submitFeedback).not.toHaveBeenCalled();
    });

    it("offers a visible close control, not just a faint text link", async () => {
      useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
      apiGet.mockResolvedValue({ settings: PROCESSED });

      renderOverlay();
      await screen.findByText("How are you using SnapOtter?");

      fireEvent.click(screen.getByRole("button", { name: "Close feedback dialog" }));

      await waitFor(() => {
        expect(apiPut).toHaveBeenCalledWith("/v1/settings", {
          "onboarding.usageSurvey.dismissedAt": expect.any(String),
        });
      });
      expect(trackFeedbackPromptDismissed).toHaveBeenCalledWith("onboarding", "close");
    });

    // RouteAnnouncer focuses and announces document.querySelector("h1") on every
    // route change. While this prompt's title was an h1 it stole focus the moment
    // the card appeared and made every later navigation announce the survey
    // instead of the page the user opened.
    it("does not claim the page's h1", async () => {
      useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
      apiGet.mockResolvedValue({ settings: PROCESSED });

      renderOverlay();
      const title = await screen.findByText("How are you using SnapOtter?");

      expect(title.tagName).not.toBe("H1");
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      // Still the dialog's accessible name.
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-labelledby", title.id);
    });

    it("can be sent after a single click, without touching the optional questions", async () => {
      useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
      apiGet.mockResolvedValue({ settings: PROCESSED });

      renderOverlay();
      await screen.findByText("How are you using SnapOtter?");

      fireEvent.click(screen.getByRole("radio", { name: /Just me/ }));
      expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
    });
  });

  it("renders nothing when the admin must still change their password", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: true });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing on the change-password route even if mustChangePassword is stale-false", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay("/change-password");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });

  it("renders nothing on the privacy policy route", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiGet.mockResolvedValue({ settings: PROCESSED });

    renderOverlay("/privacy");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByText("How are you using SnapOtter?")).toBeNull();
  });
});
