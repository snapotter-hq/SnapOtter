// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
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

import { I18nProvider } from "@/contexts/i18n-context";
import { AutomatePage } from "@/pages/automate-page";
import { type ResultNotes, useFileStore } from "@/stores/file-store";
import { usePipelineStore } from "@/stores/pipeline-store";

/**
 * #4542: a single-file Automate run renders no thumbnail strip, so a step's
 * missed size target or resize to fit had nowhere to show. The result's size
 * line carries the warning instead.
 */

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

// The page resets the file store on arrival, so the run settles after mount.
function completedSingleRun(resultNotes: ResultNotes | null) {
  arrive();
  act(() => {
    settle(resultNotes);
  });
}

function settle(resultNotes: ResultNotes | null) {
  useFileStore.getState().setFiles([new File(["x"], "doc.pdf", { type: "application/pdf" })]);
  useFileStore.getState().updateEntry(0, {
    processedUrl: "blob:result",
    processedFilename: "doc_compressed.pdf",
    processedSize: 900,
    status: "completed",
    resultNotes,
  });
}

function arrive() {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/automate"]}>
        <Routes>
          <Route path="/automate" element={<AutomatePage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {},
    }),
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [], settings: {} })),
      );
    }),
  );
  useFileStore.getState().reset();
  usePipelineStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("AutomatePage single-file result warning (#4542)", () => {
  it("says a step missed its size target", () => {
    completedSingleRun({ targetKb: 1, targetMet: false });
    for (const warning of screen.getAllByTestId("result-warning")) {
      expect(warning).toHaveTextContent(en.a11y.resultMissedTarget);
    }
    expect(screen.getAllByTestId("result-warning").length).toBeGreaterThan(0);
  });

  it("says a step scaled the result down to fit", () => {
    completedSingleRun({ resizedTo: { width: 10, height: 20 } });
    expect(screen.getAllByTestId("result-warning")[0]).toHaveTextContent(
      en.a11y.resultResizedToFit,
    );
  });

  it("shows nothing when the steps reported nothing to warn about", () => {
    completedSingleRun({ targetKb: 50, targetMet: true });
    expect(screen.queryByTestId("result-warning")).toBeNull();
    expect(screen.getAllByText(/→/).length).toBeGreaterThan(0);
  });
});
