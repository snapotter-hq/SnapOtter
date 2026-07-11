// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolFeedbackPrompt } from "@/components/feedback/tool-feedback-prompt";
import { useAnalyticsStore } from "@/stores/analytics-store";

const submitFeedback = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, accepted: true }));
const storageMap = vi.hoisted(() => new Map<string, string>());
const localStorageMock = vi.hoisted(() => ({
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn((_index: number) => null),
  get length() {
    return storageMap.size;
  },
}));

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    submitFeedback,
  };
});

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorage.clear();
  submitFeedback.mockClear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-01-15T00:00:00Z").getTime());
  useAnalyticsStore.setState({
    configLoaded: true,
    config: {
      enabled: true,
      posthogApiKey: "phc_test",
      posthogHost: "https://us.i.posthog.com",
      sentryDsn: "",
      sentryDsnWeb: "",
      posthogSampleRate: 1,
      instanceId: "instance-1",
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ToolFeedbackPrompt", () => {
  it("renders when analytics feedback capture is enabled", () => {
    render(<ToolFeedbackPrompt toolId="resize" />);

    expect(screen.getByText("How did this tool work?")).toBeDefined();
    expect(screen.getByRole("button", { name: "Worked well" })).toBeDefined();
  });

  it("does not render when analytics is disabled", () => {
    useAnalyticsStore.setState({
      configLoaded: true,
      config: {
        enabled: false,
        posthogApiKey: "",
        posthogHost: "",
        sentryDsn: "",
        sentryDsnWeb: "",
        posthogSampleRate: 0,
        instanceId: "",
      },
    });

    render(<ToolFeedbackPrompt toolId="resize" />);

    expect(screen.queryByText("How did this tool work?")).toBeNull();
  });

  it("submits quick positive feedback with survey and prompt metadata", async () => {
    render(<ToolFeedbackPrompt toolId="resize" />);

    fireEvent.click(screen.getByRole("button", { name: "Worked well" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "tool_result",
        surveyId: "tool-result-v1",
        promptVariant: "inline-v1",
        sentiment: "great",
        feedbackType: "other",
        toolId: "resize",
        jobStatus: "completed",
      });
    });

    expect(screen.getByText("Thanks for the signal.")).toBeDefined();
    expect(localStorage.getItem("snapotter-feedback-last-prompt-at")).toBeTruthy();
    expect(localStorage.getItem("snapotter-feedback-tool-prompt:resize")).toBeTruthy();
  });

  it("is suppressed during the 30-day global cooldown", () => {
    localStorage.setItem(
      "snapotter-feedback-last-prompt-at",
      String(Date.now() - 29 * 24 * 60 * 60 * 1000),
    );

    render(<ToolFeedbackPrompt toolId="resize" />);

    expect(screen.queryByText("How did this tool work?")).toBeNull();
  });

  it("is suppressed during the 90-day per-tool cooldown", () => {
    localStorage.setItem(
      "snapotter-feedback-tool-prompt:resize",
      String(Date.now() - 89 * 24 * 60 * 60 * 1000),
    );

    render(<ToolFeedbackPrompt toolId="resize" />);

    expect(screen.queryByText("How did this tool work?")).toBeNull();
  });

  it("shows after the global and per-tool cooldowns have both elapsed", () => {
    localStorage.setItem(
      "snapotter-feedback-last-prompt-at",
      String(Date.now() - 31 * 24 * 60 * 60 * 1000),
    );
    localStorage.setItem(
      "snapotter-feedback-tool-prompt:resize",
      String(Date.now() - 91 * 24 * 60 * 60 * 1000),
    );

    render(<ToolFeedbackPrompt toolId="resize" />);

    expect(screen.getByText("How did this tool work?")).toBeDefined();
  });

  it("stops nagging on the next result once shown, even without interaction", () => {
    const { unmount } = render(<ToolFeedbackPrompt toolId="resize" />);
    expect(screen.getByText("How did this tool work?")).toBeDefined();
    unmount();

    // A different tool finishes moments later. The user never touched the first
    // prompt, but it must not reappear on the very next result.
    render(<ToolFeedbackPrompt toolId="convert" />);
    expect(screen.queryByText("How did this tool work?")).toBeNull();
  });

  it("supports Don't ask again suppression", () => {
    const { unmount } = render(<ToolFeedbackPrompt toolId="resize" />);

    fireEvent.click(screen.getByRole("button", { name: "Don't ask again" }));

    expect(localStorage.getItem("snapotter-feedback-prompts-disabled")).toBe("true");
    expect(screen.queryByText("How did this tool work?")).toBeNull();

    unmount();
    render(<ToolFeedbackPrompt toolId="convert" />);

    expect(screen.queryByText("How did this tool work?")).toBeNull();
  });
});
