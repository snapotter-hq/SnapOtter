// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { BeautifySettings } from "@/components/tools/beautify-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { SignPdfSettings } from "@/components/tools/sign-pdf-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { usePipelineProcessor } from "@/hooks/use-pipeline-processor";
import { AutomatePage } from "@/pages/automate-page";
import { ToolPage } from "@/pages/tool-page";
import { displayStoredError, useFileStore } from "@/stores/file-store";
import { usePipelineStore } from "@/stores/pipeline-store";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, value);
  },
  removeItem: (key: string) => {
    storageMap.delete(key);
  },
  clear: () => {
    storageMap.clear();
  },
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

function renderInGerman(ui: React.ReactNode) {
  storageMap.set("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

function seedCanceledEntry(opts?: { count?: number; mime?: string; name?: string }) {
  const count = opts?.count ?? 1;
  const mime = opts?.mime ?? "image/png";
  const baseName = opts?.name ?? "photo.png";
  const files = Array.from(
    { length: count },
    (_, i) => new File(["bytes"], count === 1 ? baseName : `${i + 1}-${baseName}`, { type: mime }),
  );
  useFileStore.getState().setFiles(files);
  useFileStore.getState().setError("Canceled");
  for (let i = 0; i < count; i++) {
    useFileStore.getState().updateEntry(i, {
      status: "failed",
      error: "Canceled",
      errorCategory: "canceled",
    });
  }
}

describe("Canceled sentinel translation across pipeline processor, preview cards, and tool panels (#4008)", () => {
  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test-input"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/pipeline/list")) {
          return Promise.resolve(new Response(JSON.stringify({ pipelines: [] }), { status: 200 }));
        }
        if (url.includes("/config/auth")) {
          return Promise.resolve(
            new Response(JSON.stringify({ authEnabled: false }), { status: 200 }),
          );
        }
        return Promise.resolve(new Response("{}", { status: 404 }));
      }),
    );
    useFileStore.getState().reset();
    usePipelineStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useFileStore.getState().reset();
    usePipelineStore.getState().reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("maps only the Canceled sentinel in displayStoredError and preserves other values", () => {
    expect(displayStoredError(null, de.tools.processing.canceled)).toBeNull();
    expect(displayStoredError(undefined, de.tools.processing.canceled)).toBeNull();
    expect(displayStoredError("Canceled", de.tools.processing.canceled)).toBe(
      de.tools.processing.canceled,
    );
    expect(displayStoredError("Disk full", de.tools.processing.canceled)).toBe("Disk full");
  });

  it("translates the Canceled sentinel in usePipelineProcessor().error while preserving the raw store sentinel", async () => {
    storageMap.set("snapotter-locale", "de");
    seedCanceledEntry();

    const { result } = renderHook(() => usePipelineProcessor(), {
      wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
    });

    await vi.waitFor(() => {
      expect(result.current.error).toBe(de.tools.processing.canceled);
    });
    expect(useFileStore.getState().error).toBe("Canceled");
    expect(useFileStore.getState().entries[0]?.error).toBe("Canceled");

    act(() => {
      useFileStore.getState().setError("Step 1 failed");
    });
    expect(result.current.error).toBe("Step 1 failed");
  });

  it("renders the translated cancellation string on the ToolPage preview failure card", async () => {
    renderInGerman(
      <MemoryRouter initialEntries={["/image/resize"]}>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      seedCanceledEntry();
    });

    const preview = (await screen.findAllByLabelText(de.a11y.imageArea))[0];
    await vi.waitFor(() => {
      expect(preview).toHaveTextContent(de.tools.processing.canceled);
    });
    expect(preview).not.toHaveTextContent("Canceled");
  });

  it.each([
    ["desktop", 1024],
    ["mobile", 375],
  ] as const)(
    "renders the translated cancellation string on AutomatePage (%s) preview failure cards and error banners",
    async (_layout, width) => {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: width,
      });
      window.dispatchEvent(new Event("resize"));

      renderInGerman(
        <MemoryRouter initialEntries={["/automate"]}>
          <AutomatePage />
        </MemoryRouter>,
      );

      act(() => {
        seedCanceledEntry();
        usePipelineStore.getState().addStep("resize");
      });

      await vi.waitFor(() => {
        expect(screen.getAllByText(de.tools.processing.canceled).length).toBeGreaterThanOrEqual(2);
      });
      expect(screen.queryByText("Canceled")).toBeNull();
    },
  );

  it.each([
    ["StitchSettings", () => <StitchSettings />, { count: 2 }],
    ["BeautifySettings", () => <BeautifySettings />, { count: 1 }],
    ["CompareSettings", () => <CompareSettings />, { count: 1 }],
    ["WatermarkImageSettings", () => <WatermarkImageSettings />, { count: 1 }],
    ["ComposeSettings", () => <ComposeSettings />, { count: 1 }],
    [
      "SignPdfSettings",
      () => <SignPdfSettings />,
      { count: 1, mime: "application/pdf", name: "doc.pdf" },
    ],
  ] as const)(
    "renders the translated cancellation string in %s when currentEntry.error is Canceled",
    async (_name, renderPanel, seedOpts) => {
      seedCanceledEntry(seedOpts);

      renderInGerman(renderPanel());

      expect(await screen.findByText(de.tools.processing.canceled)).toBeInTheDocument();
      expect(screen.queryByText("Canceled")).toBeNull();
    },
  );
});
