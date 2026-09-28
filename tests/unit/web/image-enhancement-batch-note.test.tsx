// @vitest-environment jsdom

/**
 * A batch says how many files skipped Deep Enhance, and why when the reason is
 * the same for all of them (#1303). Each entry's resultNotes carries the
 * reason from the batch's X-File-Notes, as compress does for resizes (#1292).
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL: vi.fn(() => "blob:fake-url"),
  revokeObjectURL: vi.fn(),
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

import { DeepEnhanceBatchNote } from "@/components/tools/image-enhancement-settings";
import { format } from "@/lib/format";
import { type ResultNotes, useFileStore } from "@/stores/file-store";

const copy = en.toolSettings.imageEnhancement;

function stageResults(notes: Array<ResultNotes | null>) {
  const files = notes.map(
    (_, i) => new File([new ArrayBuffer(8)], `f${i}.png`, { type: "image/png" }),
  );
  useFileStore.getState().setFiles(files);
  notes.forEach((resultNotes, i) => {
    useFileStore.getState().updateEntry(i, {
      status: "completed",
      processedUrl: `blob:result-${i}`,
      resultNotes,
    });
  });
}

beforeEach(() => {
  useFileStore.getState().reset();
});

afterEach(cleanup);

describe("DeepEnhanceBatchNote (#1303)", () => {
  it.each([
    ["unavailable", copy.batchDeepEnhanceSkippedUnavailable],
    ["failed", copy.batchDeepEnhanceSkippedFailed],
    ["animated", copy.batchDeepEnhanceSkippedAnimated],
  ] as const)("names the reason when every skip was '%s'", (reason, template) => {
    stageResults([{ deepEnhanceSkipped: reason }, null, { deepEnhanceSkipped: reason }]);
    render(<DeepEnhanceBatchNote />);

    expect(screen.getByTestId("image-enhancement-batch-deep-skipped")).toHaveTextContent(
      format(template, { count: 2, total: 3 }),
    );
  });

  it("gives a plain count when the reasons differ", () => {
    stageResults([{ deepEnhanceSkipped: "animated" }, { deepEnhanceSkipped: "failed" }, null]);
    render(<DeepEnhanceBatchNote />);

    expect(screen.getByTestId("image-enhancement-batch-deep-skipped")).toHaveTextContent(
      format(copy.batchDeepEnhanceSkipped, { count: 2, total: 3 }),
    );
  });

  it("stays silent when every file got the deep pass", () => {
    stageResults([null, null]);
    const { container } = render(<DeepEnhanceBatchNote />);

    expect(container.textContent).toBe("");
  });

  it("stays silent for a single file, which has its own notice", () => {
    stageResults([{ deepEnhanceSkipped: "failed" }]);
    const { container } = render(<DeepEnhanceBatchNote />);

    expect(container.textContent).toBe("");
  });

  it("waits for the batch to settle before counting", () => {
    // A note left by a single run must not read "1 of 2" when a file is added.
    stageResults([{ deepEnhanceSkipped: "failed" }, null]);
    useFileStore.getState().updateEntry(1, { status: "pending" });
    const { container } = render(<DeepEnhanceBatchNote />);

    expect(container.textContent).toBe("");
  });

  it("counts only files that finished", () => {
    stageResults([{ deepEnhanceSkipped: "unavailable" }, null]);
    useFileStore.getState().updateEntry(1, { status: "failed", resultNotes: null });
    useFileStore
      .getState()
      .updateEntry(0, { status: "pending", resultNotes: { deepEnhanceSkipped: "unavailable" } });
    const { container } = render(<DeepEnhanceBatchNote />);

    expect(container.textContent).toBe("");
  });
});
