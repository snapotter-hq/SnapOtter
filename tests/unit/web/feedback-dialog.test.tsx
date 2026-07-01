// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";

const submitFeedback = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, accepted: true }));

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    submitFeedback,
  };
});

afterEach(() => {
  cleanup();
  submitFeedback.mockClear();
});

describe("FeedbackDialog", () => {
  it("submits admin install feedback with install-specific fields", async () => {
    render(<FeedbackDialog open={true} source="admin_installer" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Install method"), {
      target: { value: "docker_compose" },
    });
    fireEvent.change(screen.getByLabelText("Hardest setup area"), {
      target: { value: "environment_variables" },
    });
    fireEvent.click(screen.getByLabelText("PDF/docs"));
    fireEvent.click(screen.getByLabelText("Batch workflows"));
    fireEvent.change(screen.getByLabelText("What should we improve first?"), {
      target: { value: "The S3 example needs one complete compose snippet." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith({
        source: "admin_installer",
        surveyId: "admin-install-v1",
        promptVariant: "settings-card-v1",
        feedbackType: "other",
        message: "The S3 example needs one complete compose snippet.",
        contactOk: false,
        contactEmail: undefined,
        contactName: undefined,
        company: undefined,
        installMethod: "docker_compose",
        frictionArea: "environment_variables",
        importantAreas: ["pdf_docs", "batch_workflows"],
      });
    });
  });

  it("does not submit contact fields without contact consent", async () => {
    render(<FeedbackDialog open={true} source="global" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Feedback"), {
      target: { value: "I want a keyboard shortcut for download." },
    });
    expect(screen.queryByPlaceholderText("Email (optional)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "global",
          surveyId: "global-feedback-v1",
          contactOk: false,
          contactEmail: undefined,
          contactName: undefined,
          company: undefined,
        }),
      );
    });
  });
});
