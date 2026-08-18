// @vitest-environment jsdom

/**
 * Regression coverage for Sentry WEB-G: on plain-http installs
 * navigator.clipboard does not exist, and the copy button used to throw an
 * unhandled TypeError instead of copying. The button must fall back to the
 * execCommand path (which works in insecure contexts) and only claim
 * "Copied!" when a copy actually happened.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageToBase64Results } from "@/components/tools/image-to-base64-results";
import { useBase64Store } from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";

const RESULT = {
  filename: "otter.png",
  mimeType: "image/png",
  width: 2,
  height: 2,
  originalSize: 68,
  encodedSize: 92,
  overheadPercent: 35,
  base64: "aGVsbG8=",
  dataUri: "data:image/png;base64,aGVsbG8=",
};

describe("image-to-base64 copy button on insecure contexts", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  beforeEach(() => {
    // The component looks results up by the selected file's name, so the file
    // store needs a matching entry. jsdom has no URL.createObjectURL.
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:otter" }));
    useFileStore.getState().addFiles([new File(["png"], "otter.png", { type: "image/png" })]);
    useBase64Store.setState({
      results: [RESULT],
      errors: [],
      processing: false,
      progress: null,
      expandedIndex: 0,
    });
  });

  afterEach(() => {
    cleanup();
    Object.assign(navigator, { clipboard: originalClipboard });
    document.execCommand = originalExecCommand;
    useBase64Store.getState().reset();
    useFileStore.setState({ entries: [], files: [], selectedIndex: 0 });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("copies via the execCommand fallback when navigator.clipboard is missing", async () => {
    // Insecure context: the async Clipboard API does not exist at all.
    Object.assign(navigator, { clipboard: undefined });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<ImageToBase64Results />);
    const copyButtons = screen.getAllByRole("button", { name: /copy/i });
    fireEvent.click(copyButtons[0]);

    expect(await screen.findByText("Copied!")).toBeTruthy();
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure instead of claiming Copied! when no copy mechanism exists", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);

    render(<ImageToBase64Results />);
    const copyButtons = screen.getAllByRole("button", { name: /copy/i });
    fireEvent.click(copyButtons[0]);

    expect(await screen.findByText("Copy failed")).toBeTruthy();
    expect(screen.queryByText("Copied!")).toBeNull();
  });
});
