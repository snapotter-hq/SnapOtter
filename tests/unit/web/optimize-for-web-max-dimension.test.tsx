// @vitest-environment jsdom

/**
 * The API rejects an Optimize for Web max width or height above the resize
 * ceiling (#1185), so the panel has to stop the user at the input instead of
 * sending a request that comes back 400 "Invalid settings" (#2059).
 */

import "@testing-library/jest-dom/vitest";
import { MAX_RESIZE_OUTPUT_DIMENSION } from "@snapotter/shared";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processFiles = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
    resultPayload: null,
  }),
}));

import { OptimizeForWebSettings } from "@/components/tools/optimize-for-web-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

const copy = en.toolSettings["optimize-for-web"];

beforeEach(() => {
  processFiles.mockReset();
  // The live preview posts the same settings; keep it off the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 })),
  );
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["a"], "photo.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open() {
  render(
    <I18nProvider>
      <OptimizeForWebSettings />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText(copy.maxDimensions));
  return {
    width: screen.getByLabelText(copy.maxWidth) as HTMLInputElement,
    height: screen.getByLabelText(copy.maxHeight) as HTMLInputElement,
  };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: copy.submit }));
  return processFiles.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("Optimize for Web max dimensions stay within what the API accepts (#2059)", () => {
  it("holds the shared resize ceiling at 16383", () => {
    expect(MAX_RESIZE_OUTPUT_DIMENSION).toBe(16383);
  });

  it.each([
    ["width", "maxWidth"],
    ["height", "maxHeight"],
  ] as const)("clamps a typed max %s to the ceiling before it is sent", (which, key) => {
    const inputs = open();
    fireEvent.change(inputs[which], { target: { value: "20000" } });
    expect(inputs[which].value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(submit()[key]).toBe(MAX_RESIZE_OUTPUT_DIMENSION);
  });

  it("tells the browser the ceiling too", () => {
    const { width, height } = open();
    expect(width).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height).toHaveAttribute("max", String(MAX_RESIZE_OUTPUT_DIMENSION));
  });

  it("leaves a value at or under the ceiling alone", () => {
    const { width, height } = open();
    fireEvent.change(width, { target: { value: String(MAX_RESIZE_OUTPUT_DIMENSION) } });
    fireEvent.change(height, { target: { value: "800" } });
    expect(width.value).toBe(String(MAX_RESIZE_OUTPUT_DIMENSION));
    expect(height.value).toBe("800");
    const settings = submit();
    expect(settings.maxWidth).toBe(MAX_RESIZE_OUTPUT_DIMENSION);
    expect(settings.maxHeight).toBe(800);
  });

  // With the section collapsed the inputs unmount, so the browser's own step check
  // can't stop a decimal: it would go out and come back 400.
  it("sends whole pixels when the section is collapsed over a decimal", () => {
    const { width, height } = open();
    fireEvent.change(width, { target: { value: "800.5" } });
    fireEvent.change(height, { target: { value: "0.5" } });
    fireEvent.click(screen.getByText(copy.maxDimensions));
    const settings = submit();
    expect(settings.maxWidth).toBe(800);
    // Under one whole pixel is no limit at all, not a request for 0.
    expect(settings).not.toHaveProperty("maxHeight");
  });

  it("lets the box be cleared and sends no limit then", () => {
    const { width } = open();
    fireEvent.change(width, { target: { value: "20000" } });
    fireEvent.change(width, { target: { value: "" } });
    expect(width.value).toBe("");
    expect(submit()).not.toHaveProperty("maxWidth");
  });
});
