// @vitest-environment jsdom

/**
 * The Resize panel used to start on "Crop to fit", so an off-ratio width and
 * height silently cut the image edges off, while a bare API call letterboxed
 * the same request (#4824). The panel now starts on "Fit inside" like the API;
 * presets still crop on purpose and say so, and a saved step keeps its fit.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
  }),
}));

import { ResizeControls, ResizeSettings } from "@/components/tools/resize-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

const copy = en.toolSettings.resize;

function open(ui: ReactNode) {
  render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  processFiles.mockReset();
  processAllFiles.mockReset();
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["a"], "icon.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("Resize panel fit default (#4824)", () => {
  it("sends contain for an off-ratio width and height when the fit mode is untouched", () => {
    open(<ResizeSettings />);
    expect(screen.getByRole("button", { name: copy.fitInside })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: copy.cropToFit })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.change(screen.getByLabelText(copy.widthPx), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText(copy.heightPx), { target: { value: "32" } });
    fireEvent.click(screen.getByTestId("resize-submit"));

    expect(processFiles).toHaveBeenCalledTimes(1);
    expect(processFiles.mock.calls[0][1]).toMatchObject({ width: 32, height: 32, fit: "contain" });
  });

  it("still sends cover when the user picks Crop to fit", () => {
    open(<ResizeSettings />);
    fireEvent.click(screen.getByRole("button", { name: copy.cropToFit }));
    fireEvent.change(screen.getByLabelText(copy.widthPx), { target: { value: "32" } });
    fireEvent.change(screen.getByLabelText(copy.heightPx), { target: { value: "32" } });
    fireEvent.click(screen.getByTestId("resize-submit"));

    expect(processFiles.mock.calls[0][1]).toMatchObject({ fit: "cover" });
  });

  it("keeps presets on cover and tells the user they crop", () => {
    open(<ResizeSettings />);
    fireEvent.click(screen.getByRole("button", { name: copy.presets }));
    expect(screen.getByText(copy.presetsCropNote)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /1080 x 1080/ })[0]);
    fireEvent.click(screen.getByTestId("resize-submit"));

    expect(processFiles.mock.calls[0][1]).toMatchObject({
      width: 1080,
      height: 1080,
      fit: "cover",
    });
  });

  it("keeps a saved step's fit instead of the new default", () => {
    const onChange = vi.fn();
    open(
      <ResizeControls settings={{ width: 300, height: 200, fit: "cover" }} onChange={onChange} />,
    );

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 300, height: 200, fit: "cover" }),
    );
    expect(screen.getByRole("button", { name: copy.cropToFit })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("gives a new pipeline step contain when it has no saved fit", () => {
    const onChange = vi.fn();
    open(<ResizeControls settings={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(copy.widthPx), { target: { value: "300" } });
    fireEvent.change(screen.getByLabelText(copy.heightPx), { target: { value: "200" } });

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 300, height: 200, fit: "contain" }),
    );
  });
});
