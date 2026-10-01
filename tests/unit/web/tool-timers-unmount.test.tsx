// @vitest-environment jsdom

/**
 * Tool panels, the editor's export dialog, and the login page fade their
 * "Copied" flags (and the login page's rotating phrase) on a short timer.
 * Leaving the page before it fires must cancel it: a timer left behind calls a
 * setter on an unmounted tree, and in the unit run it can fire after jsdom is
 * torn down and fail the job after every test passed (#1619, #1797).
 *
 * Timers are faked (advancing with real time so findBy* still polls), so a
 * leaked one shows up in vi.getTimerCount() and never outlives this file.
 */

import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { FeatureBundleState } from "@snapotter/shared";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copyToClipboard = vi.hoisted(() => vi.fn(async () => true));
const copyImageToClipboard = vi.hoisted(() => vi.fn(async () => true));
const useAuth = vi.hoisted(() => vi.fn());
const toolPayload = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyToClipboard, copyImageToClipboard };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: null,
    progress: { phase: "idle", percent: 0, elapsed: 0 },
    resultPayload: toolPayload.current,
  }),
}));

// The PDF pane needs pdf.js; only the extracted-text pane is under test.
vi.mock("@/components/tools/document-view", () => ({ DocumentView: () => null }));

// The export dialog reads the Konva stage through this holder; a stand-in
// stage plus a stubbed capture is all the copy path touches.
vi.mock("@/components/editor/editor-canvas", () => ({ editorStageRefHolder: { current: {} } }));
vi.mock("@/components/editor/stage-capture", () => ({
  captureDocumentCanvas: () => ({ toDataURL: () => "data:image/png;base64,AA==" }),
}));

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import { ExportDialog } from "@/components/editor/common/export-dialog";
import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { ImageToBase64Results } from "@/components/tools/image-to-base64-results";
import { LqipPlaceholderSettings } from "@/components/tools/lqip-placeholder-settings";
import { OcrPdfView } from "@/components/tools/ocr-pdf-view";
import { OcrSettings } from "@/components/tools/ocr-settings";
import { SpriteSheetSettings } from "@/components/tools/sprite-sheet-settings";
import { LoginPage } from "@/pages/login-page";
import { useBase64Store } from "@/stores/base64-store";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

const ts = en.toolSettings;

/** An XHR that answers every request with one canned 200 body, off any timer. */
function stubXhr(body: unknown) {
  vi.stubGlobal(
    "XMLHttpRequest",
    class {
      status = 0;
      responseText = "";
      timeout = 0;
      upload = {};
      onload: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        void Promise.resolve().then(() => {
          this.status = 200;
          this.responseText = JSON.stringify(body);
          this.onload?.();
        });
      }
    },
  );
}

function ocrBundle(): FeatureBundleState {
  return {
    id: "ocr",
    name: "OCR",
    description: "Accurate local OCR",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "300 MB",
    downloadBytes: 1,
    missingDownloadBytes: 1,
    compatibility: "compatible",
    compatibilityReason: "descriptor-missing",
    selectedTarget: "linux-amd64-cpu-py312",
    healthyGeneration: null,
    availableQualities: ["fast"],
    enablesTools: ["ocr", "ocr-pdf"],
    progress: null,
    error: null,
  };
}

/**
 * Clicks a copy control, waits until the copy has resolved into state, and
 * checks that it scheduled its reset (so the unmount check below is not just
 * counting some unrelated interval).
 */
async function copyVia(button: HTMLElement) {
  const calls = copyToClipboard.mock.calls.length + copyImageToClipboard.mock.calls.length;
  const timers = vi.getTimerCount();
  await act(async () => {
    fireEvent.click(button);
  });
  await waitFor(() =>
    expect(copyToClipboard.mock.calls.length + copyImageToClipboard.mock.calls.length).toBe(
      calls + 1,
    ),
  );
  await act(async () => {});
  expect(vi.getTimerCount()).toBeGreaterThan(timers);
}

function renderLogin(path = "/login") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    shouldAdvanceTime: true,
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:otter" }));
  useAuth.mockReturnValue({
    hasPermission: () => true,
    oidcEnabled: false,
    oidcProviderName: null,
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
  toolPayload.current = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useBase64Store.getState().reset();
  useFileStore.setState({
    entries: [],
    files: [],
    selectedIndex: 0,
    processing: false,
    error: null,
  });
  copyToClipboard.mockClear();
  copyImageToClipboard.mockClear();
  useAuth.mockReset();
});

type Flow = [name: string, run: () => Promise<void>];

const flows: Flow[] = [
  [
    "color palette: copying the palette as CSS",
    async () => {
      useFileStore.setState({ files: [new File(["png"], "a.png", { type: "image/png" })] });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          json: async () => ({ colors: ["#ff0000"], hex: ["#ff0000"] }),
        })),
      );
      render(<ColorPaletteSettings />);
      fireEvent.click(screen.getByTestId("color-palette-submit"));
      await copyVia(await screen.findByTestId("color-palette-copy-css"));
    },
  ],
  [
    "sprite sheet: copying the coordinate map as CSS",
    async () => {
      toolPayload.current = {
        frames: [{ index: 0, width: 1, height: 1, left: 0, top: 0 }],
        cols: 1,
        rows: 1,
        cellWidth: 1,
        cellHeight: 1,
        canvasWidth: 1,
        canvasHeight: 1,
      };
      render(<SpriteSheetSettings />);
      await copyVia(screen.getByTestId("sprite-sheet-copy-css"));
    },
  ],
  [
    "LQIP placeholder: copying the data URI",
    async () => {
      toolPayload.current = { dataUri: "data:image/webp;base64,AA==", width: 16, height: 9 };
      render(<LqipPlaceholderSettings />);
      await copyVia(screen.getAllByRole("button", { name: en.common.copy })[0]);
    },
  ],
  [
    "OCR PDF view: copying the extracted text",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, text: async () => "extracted" })),
      );
      useFileStore.setState({
        entries: [{ processedUrl: "blob:text", status: "completed" } as never],
        selectedIndex: 0,
      });
      render(<OcrPdfView />);
      await copyVia(await screen.findByRole("button", { name: en.common.copy }));
    },
  ],
  [
    "barcode reader: copying every result",
    async () => {
      useFileStore.setState({ files: [new File(["png"], "code.png", { type: "image/png" })] });
      stubXhr({
        filename: "code.png",
        barcodes: [{ type: "QRCode", text: "hi" }],
        annotatedUrl: null,
      });
      render(<BarcodeReadSettings />);
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
      await copyVia(await screen.findByRole("button", { name: ts["barcode-read"].copyAll }));
    },
  ],
  [
    "OCR: copying the extracted text",
    async () => {
      useFeaturesStore.setState({ bundles: [ocrBundle()], loaded: true, loadError: false });
      useFileStore.setState({ files: [new File(["png"], "scan.png", { type: "image/png" })] });
      vi.stubGlobal(
        "EventSource",
        class {
          close() {}
        },
      );
      stubXhr({ text: "hello" });
      render(<OcrSettings />);
      fireEvent.click(screen.getByTestId("ocr-submit"));
      await screen.findByTestId("ocr-result-text");
      await copyVia(screen.getByRole("button", { name: en.common.copy }));
    },
  ],
  [
    "image to Base64: copying the data URI",
    async () => {
      useFileStore.getState().addFiles([new File(["png"], "otter.png", { type: "image/png" })]);
      useBase64Store.setState({
        results: [
          {
            filename: "otter.png",
            mimeType: "image/png",
            width: 2,
            height: 2,
            originalSize: 68,
            encodedSize: 92,
            overheadPercent: 35,
            base64: "aGVsbG8=",
            dataUri: "data:image/png;base64,aGVsbG8=",
            entryId: useFileStore.getState().entries[0].id,
          },
        ],
        errors: [],
        processing: false,
        progress: null,
        expandedIndex: 0,
      });
      render(<ImageToBase64Results />);
      await copyVia(screen.getAllByRole("button", { name: /copy/i })[0]);
    },
  ],
  [
    "editor export dialog: copying the image",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ blob: async () => new Blob(["x"]) })),
      );
      render(<ExportDialog onClose={() => {}} />);
      await copyVia(screen.getByRole("button", { name: en.common.copy }));
    },
  ],
  [
    "login: copying the enrollment recovery codes",
    async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            requiresMfaEnrollment: true,
            enrollmentToken: "enroll-token-1",
            uri: "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter",
            recoveryCodes: ["AAAA-1111"],
          }),
        })),
      );
      renderLogin();
      fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
      fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
      await copyVia(
        await screen.findByRole("button", {
          name: en.settings.security.twoFactorCopyRecoveryCodes,
        }),
      );
    },
  ],
  [
    "login: the rotating phrase mid-swap",
    async () => {
      renderLogin();
      // The phrase rotates every 3 s, fading out for 300 ms before it swaps.
      const timers = vi.getTimerCount();
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(vi.getTimerCount()).toBeGreaterThan(timers);
    },
  ],
];

describe("Copy and message timers are cancelled when the page goes", () => {
  it.each(flows)("%s", async (_name, run) => {
    await run();
    // The fade-out timer is pending while the page is up...
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    // ...and leaving the page leaves nothing scheduled to fire later.
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still clears the Copied flag while the page stays up", async () => {
    toolPayload.current = { dataUri: "data:image/webp;base64,AA==", width: 16, height: 9 };
    render(<LqipPlaceholderSettings />);
    const copyButton = () => screen.getAllByRole("button", { name: en.common.copy })[0];
    await copyVia(copyButton());
    expect(copyButton().querySelector(".text-success-ink")).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(copyButton().querySelector(".text-success-ink")).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the sprite sheet's Copied flag across a re-run", async () => {
    const payload = {
      frames: [{ index: 0, width: 1, height: 1, left: 0, top: 0 }],
      cols: 1,
      rows: 1,
      cellWidth: 1,
      cellHeight: 1,
      canvasWidth: 1,
      canvasHeight: 1,
    };
    toolPayload.current = payload;
    const { rerender } = render(<SpriteSheetSettings />);
    await copyVia(screen.getByTestId("sprite-sheet-copy-css"));

    // A new run clears the result, which unmounts the output (and its buttons)
    // while the panel that owns the Copied flag stays up.
    toolPayload.current = null;
    rerender(<SpriteSheetSettings />);
    expect(screen.queryByTestId("sprite-sheet-output")).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    toolPayload.current = payload;
    rerender(<SpriteSheetSettings />);
    expect(
      screen.getByTestId("sprite-sheet-copy-css").querySelector(".text-success-ink"),
    ).toBeNull();
  });
});

describe("Login focus still lands on the MFA field", () => {
  // The focus goes through useTimeouts, which drops calls made before its own
  // mount effect has run. The SSO redirect schedules it on first commit.
  it("after an SSO redirect hands back an mfaToken", async () => {
    renderLogin("/login?mfaToken=abc-123");
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByPlaceholderText("000000")).toHaveFocus();
  });

  it("after a password login that needs a code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ requiresMfa: true, mfaToken: "mfa-1" }),
      })),
    );
    renderLogin();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
    const code = await screen.findByPlaceholderText("000000");
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(code).toHaveFocus();
  });
});

describe("Components never throw away a timer id", () => {
  // A setTimeout whose id nobody keeps can never be cleared, so it outlives
  // the component that scheduled it. Use useTimeouts() (cleared on unmount),
  // or keep the id and clear it in an effect cleanup.
  const web = join(__dirname, "../../../apps/web/src");
  // Fire-and-forget on purpose, and not tied to a component's lifetime. Keyed
  // by file and exact (trimmed) line, so a new bare timer in these files still
  // trips the guard.
  const allowed: Record<string, string[]> = {
    // Module-level SSE helpers: the reconnect checks the helper's own `done`.
    "components/tools/erase-object-settings.tsx": ["setTimeout(open, 500);"],
    "components/tools/sign-pdf-settings.tsx": ["setTimeout(open, 500);"],
    // Writes the file store after navigating away, which is the point.
    "components/files/file-details.tsx": ["setTimeout(() => {"],
  };
  const bareTimer = /(^|[;{]|=>|\bvoid)\s*(?:(?:window|globalThis)\.)?setTimeout\s*\(/;

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  const files = [...walk(join(web, "components")), ...walk(join(web, "pages"))].map((path) =>
    relative(web, path),
  );

  it.each(files)("%s", (file) => {
    const permitted = allowed[file] ?? [];
    const offenders = readFileSync(join(web, file), "utf8")
      .split("\n")
      .flatMap((line, i) =>
        bareTimer.test(line) && !/new Promise/.test(line) && !permitted.includes(line.trim())
          ? [`${i + 1}: ${line.trim()}`]
          : [],
      );
    expect(offenders).toEqual([]);
  });

  it("allows only lines that still exist", () => {
    for (const [file, lines] of Object.entries(allowed)) {
      const source = readFileSync(join(web, file), "utf8")
        .split("\n")
        .map((line) => line.trim());
      for (const line of lines) expect(source).toContain(line);
    }
  });
});
