// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

// The panels render in German, so every fallback check proves which key the
// panel used: in English "Failed: 422" reads the same from the translated key
// and from a hard-coded literal, and "Processing failed: 422" is also
// parseApiError's own default.
vi.mock("@/contexts/i18n-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/i18n-context")>();
  const { de: german } = await import("@snapotter/shared/i18n/de.js");
  return {
    ...actual,
    useTranslation: () => ({
      t: german,
      locale: "de",
      dir: "ltr",
      setLocale: () => {},
      supportedLocales: [],
    }),
  };
});

import { BarcodeGenerateSettings } from "@/components/tools/barcode-generate-settings";
import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
import { BeautifySettings } from "@/components/tools/beautify-settings";
import { CollageSettings } from "@/components/tools/collage-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { ImageToBase64Settings } from "@/components/tools/image-to-base64-settings";
import { ImageToPdfSettings } from "@/components/tools/image-to-pdf-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { ocrOneFile } from "@/components/tools/ocr-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { StripMetadataSettings } from "@/components/tools/strip-metadata-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { failedAnswerMessage, parseApiError } from "@/lib/api";
import { format } from "@/lib/format";
import { useBase64Store } from "@/stores/base64-store";
import { useCollageStore } from "@/stores/collage-store";
import { useFileStore } from "@/stores/file-store";

/**
 * Tool panels that post with their own XHR or fetch used to read a failed
 * answer as `body.error || fallback`. An object-valued `error` reached the
 * screen as "[object Object]", and a `details`-only answer showed the bare
 * status fallback instead of its reason (#1858). They now go through
 * failedAnswerMessage, the same parseApiError reading useToolProcessor uses,
 * with each panel's own fallback kept for an answer that names no reason.
 */

const STATUS = 422;

describe("parseApiError and failedAnswerMessage", () => {
  const FALLBACK = "Panel fallback";

  it.each([
    ["a string error", { error: "Bad file" }, "Bad file"],
    ["an object error", { error: { reason: "x" } }, FALLBACK],
    ["an array error", { error: ["x"] }, FALLBACK],
    ["details alone", { details: "Not enough memory" }, "Not enough memory"],
    ["an object error with details", { error: { reason: "x" }, details: "why" }, "why"],
    [
      "error and different details",
      { error: "Invalid settings", details: "x: too big" },
      "Invalid settings: x: too big",
    ],
    [
      "the error handler's echo of one message",
      { error: "Bad file", details: "Bad file" },
      "Bad file",
    ],
    ["array details", { error: "Invalid", details: [{ message: "a" }, "b"] }, "Invalid: a; b"],
    [
      "an array details item whose message is not a string",
      { details: [{ message: { x: 1 } }] },
      '{"message":{"x":1}}',
    ],
    ["empty array details", { error: "Bad file", details: [] }, "Bad file"],
    ["empty string details", { error: "Bad file", details: "" }, "Bad file"],
    ["a string message", { message: "Not found" }, "Not found"],
    ["an object message", { message: { text: "x" } }, FALLBACK],
    ["an empty object", {}, FALLBACK],
  ])("reads %s", (_label, body, expected) => {
    expect(failedAnswerMessage(en, body, STATUS, FALLBACK)).toBe(expected);
    expect(parseApiError(body as Record<string, unknown>, STATUS, FALLBACK)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["an array", [{ error: "x" }]],
    ["a string", "Bad file"],
    ["a number", 7],
  ])("answers the fallback for a body that is %s", (_label, body) => {
    expect(failedAnswerMessage(en, body, STATUS, FALLBACK)).toBe(FALLBACK);
  });

  it("keeps parseApiError's status fallback when no fallback is passed", () => {
    expect(parseApiError({ error: { reason: "x" } }, STATUS)).toBe("Processing failed: 422");
  });

  it("turns FEATURE_NOT_INSTALLED into the translated install message", () => {
    const body = {
      error: "Feature not installed",
      code: "FEATURE_NOT_INSTALLED",
      feature: "background-removal",
      featureName: "Background Removal",
      estimatedSize: "500MB",
    };
    const feature = en.featureBundles["background-removal"].name;
    expect(failedAnswerMessage(en, body, 501, FALLBACK)).toBe(
      format(en.errors.featureNotInstalled, { feature }),
    );
    expect(failedAnswerMessage(en, body, 501, FALLBACK, "Remove Background")).toBe(
      format(en.errors.featureNotInstalledForTool, { tool: "Remove Background", feature }),
    );
  });
});

// ── Panels ──────────────────────────────────────────────────────

class FakeXhr {
  static instances: FakeXhr[] = [];

  timeout = 0;
  status = 0;
  readyState = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  upload: { onprogress: unknown; onload: unknown } = { onprogress: null, onload: null };

  constructor() {
    FakeXhr.instances.push(this);
  }

  open() {}
  setRequestHeader() {}
  send() {}
  abort() {}

  respond(status: number, body: unknown) {
    act(() => {
      this.status = status;
      this.readyState = 4;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }
}

class FakeEventSource {
  onmessage: unknown = null;
  onerror: unknown = null;
  onopen: unknown = null;
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

function image(name: string): File {
  return new File(["png"], name, { type: "image/png" });
}

function chooseFile(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("panel has no file input");
  fireEvent.change(input, { target: { files: [file] } });
}

/** A proxy's error page: res.json() rejects on it. */
const NOT_JSON = Symbol("not JSON");

let answer: { status: number; body: unknown };

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: answer.status,
      json: async () => {
        if (answer.body === NOT_JSON) throw new SyntaxError("Unexpected token '<'");
        return answer.body;
      },
    })),
  );
}

interface PanelRow {
  panel: string;
  transport: "xhr" | "fetch";
  fallback: string;
  /** Renders the panel and starts the request. */
  start: () => void | Promise<void>;
  /** The failure text the panel ended on, or null while it has none. */
  shown?: () => string | null | undefined;
  /** How the panel frames the message, when it adds to it. */
  framed?: (message: string) => string;
}

const failedWithStatus = format(de.errors.failedWithStatus, { status: STATUS });
const processingFailedWithStatus = format(de.errors.processingFailedWithStatus, {
  status: STATUS,
});

const PANELS: PanelRow[] = [
  {
    panel: "stitch",
    transport: "xhr",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
      render(<StitchSettings />);
      fireEvent.click(screen.getByTestId("stitch-submit"));
    },
  },
  {
    panel: "collage",
    transport: "xhr",
    fallback: failedWithStatus,
    start: () => {
      useCollageStore.getState().addImages([image("one.png"), image("two.png")]);
      render(<CollageSettings />);
      fireEvent.click(screen.getByTestId("collage-submit"));
    },
  },
  {
    panel: "barcode-read",
    transport: "xhr",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("code.png")]);
      render(<BarcodeReadSettings />);
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
    },
    framed: (message) => `code.png: ${message}`,
  },
  {
    panel: "beautify (image background)",
    transport: "fetch",
    fallback: format(de.toolSettings.beautify.processingFailedStatus, { status: STATUS }),
    start: () => {
      useFileStore.getState().setFiles([image("shot.png")]);
      const { container } = render(<BeautifySettings />);
      fireEvent.click(screen.getByRole("button", { name: de.toolSettings.beautify.bgImage }));
      chooseFile(container, image("bg.png"));
      fireEvent.click(screen.getByTestId("beautify-submit"));
    },
  },
  {
    panel: "color-palette",
    transport: "fetch",
    fallback: `Failed: ${STATUS}`,
    start: () => {
      useFileStore.getState().setFiles([image("photo.png")]);
      render(<ColorPaletteSettings />);
      fireEvent.click(screen.getByTestId("color-palette-submit"));
    },
  },
  {
    panel: "strip-metadata (inspect)",
    transport: "fetch",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("photo.png")]);
      render(<StripMetadataSettings />);
    },
  },
  {
    panel: "watermark-image (one file)",
    transport: "fetch",
    fallback: processingFailedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("photo.png")]);
      const { container } = render(<WatermarkImageSettings />);
      chooseFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
    },
  },
  {
    panel: "watermark-image (several files)",
    transport: "fetch",
    fallback: de.errors.processingFailedNoDetail,
    start: () => {
      useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
      const { container } = render(<WatermarkImageSettings />);
      chooseFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
    },
    shown: () => useFileStore.getState().entries[0]?.error,
  },
  {
    panel: "find-duplicates",
    transport: "xhr",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
      render(<FindDuplicatesSettings />);
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
    },
  },
  {
    panel: "compare",
    transport: "fetch",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("one.png")]);
      const { container } = render(<CompareSettings />);
      chooseFile(container, image("two.png"));
      fireEvent.click(screen.getByTestId("compare-submit"));
    },
  },
  {
    panel: "compose",
    transport: "fetch",
    fallback: processingFailedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("base.png")]);
      const { container } = render(<ComposeSettings />);
      chooseFile(container, image("overlay.png"));
      fireEvent.click(screen.getByTestId("compose-submit"));
    },
  },
  {
    panel: "barcode-generate",
    transport: "fetch",
    fallback: format(de.errors.requestFailedWithStatus, { status: STATUS }),
    start: () => {
      render(<BarcodeGenerateSettings />);
      fireEvent.change(screen.getByTestId("barcode-input-text"), { target: { value: "12345" } });
      fireEvent.click(screen.getByTestId("barcode-generate-submit"));
    },
  },
  {
    panel: "info",
    transport: "fetch",
    fallback: `Failed: ${STATUS}`,
    start: () => {
      useFileStore.getState().setFiles([image("photo.png")]);
      render(<InfoSettings />);
      fireEvent.click(screen.getByTestId("info-submit"));
    },
  },
  {
    panel: "image-to-base64",
    transport: "fetch",
    fallback: `Failed: ${STATUS}`,
    start: () => {
      useFileStore.getState().setFiles([image("photo.png")]);
      render(<ImageToBase64Settings />);
      fireEvent.click(screen.getByTestId("base64-submit"));
    },
    shown: () => useBase64Store.getState().errors[0]?.error,
  },
  {
    panel: "image-to-pdf",
    transport: "xhr",
    fallback: failedWithStatus,
    start: () => {
      useFileStore.getState().setFiles([image("page.png")]);
      render(<ImageToPdfSettings />);
      fireEvent.click(screen.getByTestId("image-to-pdf-submit"));
    },
  },
];

/** Answers a few panel shapes a real server sends, with what the panel should end on. */
function answers(fallback: string): Array<[string, unknown, string]> {
  return [
    ["an object error", { error: { reason: "x" } }, fallback],
    ["details alone", { details: "Not enough memory" }, "Not enough memory"],
    ["a string error", { error: "Bad file" }, "Bad file"],
    [
      "the error handler's echo of one message",
      { error: "Bad file", details: "Bad file" },
      "Bad file",
    ],
  ];
}

beforeEach(() => {
  let blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.stubGlobal("EventSource", FakeEventSource);
  stubFetch();
  useFileStore.getState().reset();
  useCollageStore.getState().reset();
  useBase64Store.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useFileStore.getState().reset();
  useCollageStore.getState().reset();
  useBase64Store.getState().reset();
});

describe.each(PANELS)("$panel: a failed answer", (row) => {
  // An XHR panel's unparseable body takes its own catch branch, unchanged here.
  const shapes: Array<[string, unknown, string]> =
    row.transport === "fetch"
      ? [...answers(row.fallback), ["a body that is not JSON", NOT_JSON, row.fallback]]
      : answers(row.fallback);

  it.each(shapes)("shows %s as readable text", async (_label, body, message) => {
    const expected = row.framed ? row.framed(message) : message;
    answer = { status: STATUS, body };
    await row.start();
    if (row.transport === "xhr") {
      await waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThan(0));
      FakeXhr.instances[0].respond(STATUS, body);
    }

    if (row.shown) {
      await waitFor(() => expect(row.shown?.()).toBe(expected), { timeout: 3000 });
    } else {
      await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument(), {
        timeout: 3000,
      });
    }
    expect(document.body.textContent).not.toContain("[object Object]");
  });
});

describe("ocr: a failed answer", () => {
  it.each(answers(`Failed: ${STATUS}`))(
    "rejects %s with readable text",
    async (_label, body, expected) => {
      const run = ocrOneFile(
        image("scan.png"),
        { quality: "fast", language: "en", enhance: false },
        { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
        { t: en },
      );
      await waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThan(0));
      FakeXhr.instances[0].respond(STATUS, body);

      await expect(run).rejects.toThrow(expected);
    },
  );

  it("rejects FEATURE_NOT_INSTALLED with the install message in the locale it was given", async () => {
    const run = ocrOneFile(
      image("scan.png"),
      { quality: "best", language: "en", enhance: false },
      { onUploadProgress: vi.fn(), onProcessingProgress: vi.fn() },
      { t: de },
    );
    await waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThan(0));
    FakeXhr.instances[0].respond(501, {
      error: "Feature not installed",
      code: "FEATURE_NOT_INSTALLED",
      feature: "ocr",
      featureName: "OCR",
      estimatedSize: "1 GB",
    });

    await expect(run).rejects.toThrow(
      format(de.errors.featureNotInstalled, { feature: de.featureBundles.ocr.name }),
    );
  });

  it("is handed the panel's locale", () => {
    const source = readFileSync(
      resolve(__dirname, "../../../apps/web/src/components/tools/ocr-settings.tsx"),
      "utf8",
    );
    expect(source).toMatch(/processingFailed: t\.errors\.processingFailed,\s*t,/);
  });
});

describe("no panel reads a failed answer's body by hand", () => {
  // Every tool panel that posts for itself and reads a non-2xx JSON body.
  // Edit Metadata and Remove Background are listed here rather than rendered
  // above: Edit Metadata shows a fixed line for a failed inspect, and Remove
  // Background's effects request only exists after a finished first pass.
  const ROUTED = [
    "barcode-generate",
    "barcode-read",
    "beautify",
    "collage",
    "color-palette",
    "compare",
    "compose",
    "edit-metadata",
    "find-duplicates",
    "image-to-base64",
    "image-to-pdf",
    "info",
    "ocr",
    "remove-bg",
    "stitch",
    "strip-metadata",
    "watermark-image",
  ];

  it.each(ROUTED)("%s goes through failedAnswerMessage", (id) => {
    const source = readFileSync(
      resolve(__dirname, `../../../apps/web/src/components/tools/${id}-settings.tsx`),
      "utf8",
    );
    expect(source).toContain("failedAnswerMessage(");
    expect(source).not.toMatch(/body\??\.(error|details)\s*\|\|/);
  });
});
