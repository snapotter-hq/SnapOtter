// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { ToolPage } from "@/pages/tool-page";
import { useFileStore } from "@/stores/file-store";

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

function renderToolPage(path: string) {
  return render(
    <I18nProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

function png(name: string): File {
  return new File([new ArrayBuffer(64)], name, { type: "image/png" });
}

function stagedNames(): string[] {
  return useFileStore.getState().entries.map((e) => e.file.name);
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  let n = 0;
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => `blob:input-${n++}`,
      revokeObjectURL: () => {},
    }),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ authEnabled: false }), { status: 200 })),
    ),
  );
  HTMLElement.prototype.scrollIntoView = vi.fn();
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ToolPage per-file remove (#4836)", () => {
  it("removes one file from the left file list and keeps the rest", async () => {
    renderToolPage("/image/compress");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png"), png("b.png"), png("c.png")]);
    });

    // One control in the left list, one on the thumbnail strip.
    const controls = screen.getAllByRole("button", { name: "Remove b.png" });
    expect(controls).toHaveLength(2);
    await act(async () => {
      fireEvent.click(controls[0]);
    });

    expect(stagedNames()).toEqual(["a.png", "c.png"]);
    expect(useFileStore.getState().files.map((f) => f.name)).toEqual(["a.png", "c.png"]);
  });

  it("removes one file from the thumbnail strip and keeps the selection on its file", async () => {
    renderToolPage("/image/compress");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png"), png("b.png"), png("c.png")]);
      useFileStore.getState().setSelectedIndex(2);
    });

    const controls = screen.getAllByRole("button", { name: "Remove a.png" });
    await act(async () => {
      fireEvent.click(controls[controls.length - 1]);
    });

    expect(stagedNames()).toEqual(["b.png", "c.png"]);
    const { selectedIndex, entries } = useFileStore.getState();
    expect(entries[selectedIndex].file.name).toBe("c.png");
  });

  it("returns to the empty dropzone when the only file is removed", async () => {
    renderToolPage("/image/compress");
    await act(async () => {
      useFileStore.getState().setFiles([png("only.png")]);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove only.png" }));
    });

    expect(stagedNames()).toEqual([]);
  });

  it("refuses to remove a file while a run is in flight, like Clear all", async () => {
    renderToolPage("/image/compress");
    await act(async () => {
      useFileStore.getState().setFiles([png("a.png"), png("b.png")]);
      useFileStore.getState().setProcessing(true);
    });

    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Remove a.png" })[0]);
    });

    expect(stagedNames()).toEqual(["a.png", "b.png"]);
  });

  it("lets the base Image to PDF tool reorder its pages like its presets", async () => {
    renderToolPage("/image/image-to-pdf");
    await act(async () => {
      useFileStore.getState().setFiles([png("p1.png"), png("p2.png")]);
    });

    expect(screen.getAllByLabelText(/drag to reorder/i)).toHaveLength(2);
    const reverse = screen.getByRole("button", { name: /reverse order/i });
    await act(async () => {
      fireEvent.click(reverse);
    });
    expect(stagedNames()).toEqual(["p2.png", "p1.png"]);
  });
});
