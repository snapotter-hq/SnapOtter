// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The load-error path must report through analytics (Sentry) and surface the
// returned event id in the copy; the mock stands in for the lazy SDK import.
const captureHandledError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ captureHandledError }));

import { ImageViewer } from "@/components/common/image-viewer";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ImageViewer result load error (#797)", () => {
  it("keeps the input overlay mounted and points at the download button", async () => {
    captureHandledError.mockResolvedValue("abc123deadbeef");
    render(
      <ImageViewer
        src="http://localhost/api/v1/jobs/j1/download"
        filename="photo-pixelated.png"
        fileSize={1234}
        resultContext={{ toolId: "pixelate" }}
        imageWrapperStyle={{}}
        imageWrapperChildren={<div data-testid="selection-overlay" />}
      />,
    );

    fireEvent.error(screen.getByAltText("photo-pixelated.png"));

    // Result-specific copy with a next step, not the generic dead end
    expect(await screen.findByText(/result preview failed to load/i)).toBeInTheDocument();
    expect(screen.getByText(/download button/i)).toBeInTheDocument();
    // The input overlay (pixelate's selection box) survives the error
    expect(screen.getByTestId("selection-overlay")).toBeInTheDocument();
    // The Sentry event id is shown so the failure is referenceable
    expect(await screen.findByText(/abc123deadbeef/)).toBeInTheDocument();
  });

  it("reports the failure once with the tool id and an authored-safe message", async () => {
    captureHandledError.mockResolvedValue("evt1");
    render(
      <ImageViewer
        src="blob:result"
        filename="out.png"
        fileSize={5}
        resultContext={{ toolId: "pixelate" }}
      />,
    );

    fireEvent.error(screen.getByAltText("out.png"));

    await waitFor(() => expect(captureHandledError).toHaveBeenCalledTimes(1));
    const [err, tags] = captureHandledError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    // Plain Error messages get type-only'd by the Sentry scrubber; the report
    // must carry the SafeError marker so the message survives.
    expect((err as { isSafeMessage?: unknown }).isSafeMessage).toBe(true);
    expect(tags).toMatchObject({ tool_id: "pixelate", error_class: "operational" });
  });

  it("omits the error id line when telemetry is off", async () => {
    captureHandledError.mockResolvedValue(null);
    render(
      <ImageViewer
        src="blob:result"
        filename="out.png"
        fileSize={5}
        resultContext={{ toolId: "pixelate" }}
      />,
    );

    fireEvent.error(screen.getByAltText("out.png"));

    expect(await screen.findByText(/result preview failed to load/i)).toBeInTheDocument();
    expect(screen.queryByText(/error id/i)).not.toBeInTheDocument();
  });

  it("keeps the generic copy and stays silent for a non-result preview", () => {
    render(<ImageViewer src="blob:original" filename="in.png" fileSize={5} />);

    fireEvent.error(screen.getByAltText("in.png"));

    expect(screen.getByText("Preview not available")).toBeInTheDocument();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("hides the size line for an unknown fileSize instead of showing a zero size", () => {
    render(<ImageViewer src="blob:x" filename="out.png" fileSize={null} />);
    expect(screen.queryByText(/^(?:0|null)\s*[KMG]?B$/)).not.toBeInTheDocument();
  });

  it("still shows a known fileSize", () => {
    render(<ImageViewer src="blob:x" filename="out.png" fileSize={2048} />);
    expect(screen.getByText("2 KB")).toBeInTheDocument();
  });
});
