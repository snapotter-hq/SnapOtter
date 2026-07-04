// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";

const submitFeedback = vi.hoisted(() => vi.fn());

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, submitFeedback };
});

const MESSAGE_PLACEHOLDER = "Tell us what worked, what broke, or what would make SnapOtter better.";

beforeEach(() => {
  submitFeedback.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FeedbackDialog global off-state handoff", () => {
  it("reveals GitHub and email handoff when the server does not record the feedback", async () => {
    submitFeedback.mockResolvedValue({ ok: true, accepted: false });
    render(<FeedbackDialog open source="global" onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(MESSAGE_PLACEHOLDER), {
      target: { value: "The queue stalls on large PDFs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    const githubLink = await screen.findByRole("link", { name: "Open a GitHub issue" });
    expect(githubLink.getAttribute("href")).toContain("template=feedback.yml");
    expect(githubLink.getAttribute("href")).toContain("issues/new");

    const emailLink = screen.getByRole("link", { name: "Email us" });
    expect(emailLink.getAttribute("href")).toContain("mailto:contact@snapotter.com");

    // The typed message must actually reach both handoff targets, not just the static parts.
    const githubDetails = new URL(githubLink.getAttribute("href") ?? "").searchParams.get(
      "details",
    );
    expect(githubDetails).toBe("The queue stalls on large PDFs");
    const emailBody = new URL(emailLink.getAttribute("href") ?? "").searchParams.get("body");
    expect(emailBody).toBe("The queue stalls on large PDFs");

    expect(screen.queryByText("Thanks for the feedback.")).toBeNull();
  });

  it("shows the normal thanks when the feedback is recorded", async () => {
    submitFeedback.mockResolvedValue({ ok: true, accepted: true });
    render(<FeedbackDialog open source="global" onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(MESSAGE_PLACEHOLDER), {
      target: { value: "Great tool" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByText("Thanks for the feedback.")).toBeDefined();
    expect(screen.queryByRole("link", { name: "Open a GitHub issue" })).toBeNull();
  });
});
