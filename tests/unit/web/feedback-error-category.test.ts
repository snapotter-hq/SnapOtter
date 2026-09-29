// @vitest-environment jsdom
import { de } from "@snapotter/shared/i18n/de.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

import { classifyFeedbackError, FeedbackCategoryError, feedbackCategoryOf } from "@/lib/feedback";
import { useFileStore } from "@/stores/file-store";

// #1596: the feedback category came only from English keywords in the message
// the user saw, so any translated error landed in processing_error.
describe("classifyFeedbackError", () => {
  it("misfiles a translated timeout when it has only the text to go on", () => {
    // The keyword fallback stays for server text, which is English.
    expect(classifyFeedbackError(de.errors.requestTimedOut)).toBe("processing_error");
  });

  it("uses the category the failure was stored with over the text", () => {
    expect(classifyFeedbackError(de.errors.requestTimedOut, "timeout")).toBe("timeout");
    expect(classifyFeedbackError(de.errors.fileTooLarge, "upload_error")).toBe("upload_error");
  });

  it("reports unknown when there is no message, whatever category is left", () => {
    expect(classifyFeedbackError(null, "timeout")).toBe("unknown");
    expect(classifyFeedbackError("", "upload_error")).toBe("unknown");
  });

  it("still reads English server text when no category was stored", () => {
    expect(classifyFeedbackError("Request timed out", null)).toBe("timeout");
    expect(classifyFeedbackError("Unsupported file type", undefined)).toBe("unsupported_format");
  });
});

describe("feedbackCategoryOf", () => {
  it("reads the category a FeedbackCategoryError carries", () => {
    const err = new FeedbackCategoryError(de.errors.requestTimedOut, "timeout");
    expect(err.message).toBe(de.errors.requestTimedOut);
    expect(err).toBeInstanceOf(Error);
    expect(feedbackCategoryOf(err)).toBe("timeout");
  });

  it("has nothing to say about a plain Error or a non-error", () => {
    expect(feedbackCategoryOf(new Error("boom"))).toBeNull();
    expect(feedbackCategoryOf("boom")).toBeNull();
    expect(feedbackCategoryOf(undefined)).toBeNull();
  });
});

describe("file store errorCategory", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {},
    });
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([new File(["x"], "a.png", { type: "image/png" })]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the category stored with a failure", () => {
    useFileStore.getState().updateEntry(0, {
      status: "failed",
      error: de.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    expect(useFileStore.getState().entries[0].errorCategory).toBe("timeout");
  });

  it("drops a stale category when the error changes without one", () => {
    // A re-run clears the error and may fail for a different reason; the old
    // timeout category must not label the new message.
    const { updateEntry } = useFileStore.getState();
    updateEntry(0, {
      status: "failed",
      error: de.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    updateEntry(0, { status: "processing", error: null });
    expect(useFileStore.getState().entries[0].errorCategory).toBeNull();

    updateEntry(0, { status: "failed", error: "Unsupported file type", errorCategory: "timeout" });
    updateEntry(0, { status: "failed", error: "Something else broke" });
    expect(useFileStore.getState().entries[0].errorCategory).toBeNull();
  });

  it("drops the category when undo resets the entries", () => {
    // undoProcessing writes entries directly, not through updateEntry.
    useFileStore.getState().updateEntry(0, {
      status: "failed",
      error: de.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    useFileStore.getState().undoProcessing();
    expect(useFileStore.getState().entries[0]).toMatchObject({ error: null, errorCategory: null });
  });

  it("leaves the category alone when the patch doesn't touch the error", () => {
    const { updateEntry } = useFileStore.getState();
    updateEntry(0, {
      status: "failed",
      error: de.errors.requestTimedOut,
      errorCategory: "timeout",
    });
    updateEntry(0, { resultNotes: null });
    expect(useFileStore.getState().entries[0].errorCategory).toBe("timeout");
  });
});
