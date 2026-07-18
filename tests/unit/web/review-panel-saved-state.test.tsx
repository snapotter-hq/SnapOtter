// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

vi.mock("@/components/feedback/tool-feedback-prompt", () => ({
  ToolFeedbackPrompt: () => null,
}));

import { ReviewPanel } from "@/components/common/review-panel";

function renderPanel(props: Partial<Parameters<typeof ReviewPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ReviewPanel
        filename="photo_resize.png"
        fileSize={512}
        fileType="PNG"
        originalSize={1024}
        downloadUrl="/api/v1/download/job-1/photo_resize.png"
        onUndo={() => {}}
        onStartOver={() => {}}
        currentToolId="resize"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("ReviewPanel library saved state (issue #495)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the manual save link when the result was not auto-saved", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: /save to files/i })).toBeDefined();
    expect(screen.queryByRole("link", { name: /view in files/i })).toBeNull();
  });

  it("replaces the manual save link with the saved indicator after an auto-save", () => {
    renderPanel({ savedLibraryFileId: "lib-copy" });

    expect(screen.getByText("Saved to Files")).toBeDefined();
    expect(screen.getByRole("link", { name: /view in files/i })).toBeDefined();
    // The manual save button must be gone: clicking it would create a duplicate
    expect(screen.queryByRole("button", { name: /save to files/i })).toBeNull();
  });

  it("shows neither control for data-output tools", () => {
    renderPanel({ currentToolId: "ocr", savedLibraryFileId: "lib-copy" });

    expect(screen.queryByRole("button", { name: /save to files/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /view in files/i })).toBeNull();
  });
});
