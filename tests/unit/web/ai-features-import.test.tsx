// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { FeatureBundleState } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, formatHeadersMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  formatHeadersMock: vi.fn(() => ({ Authorization: "Bearer test" })),
}));

vi.mock("@/lib/api", () => ({
  apiGet: apiGetMock,
  formatHeaders: formatHeadersMock,
}));

import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFeaturesStore } from "@/stores/features-store";

const fetchMock = vi.fn();

function renderSection(overrides: Partial<ReturnType<typeof useFeaturesStore.getState>> = {}) {
  useFeaturesStore.setState({
    bundles: [],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(async () => {}),
    installBundle: vi.fn(async () => {}),
    uninstallBundle: vi.fn(async () => {}),
    reinstallBundle: vi.fn(async () => {}),
    installAll: vi.fn(async () => {}),
    resetEnvironment: vi.fn(async () => {}),
    resetError: null,
    resetVenvKept: false,
    ...overrides,
  });
  return render(<AiFeaturesSection />);
}

beforeEach(() => {
  apiGetMock.mockReset();
  apiGetMock.mockResolvedValue({ totalBytes: 0 });
  formatHeadersMock.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offline AI bundle import", () => {
  it("requires and posts the signed OCR index and runtime archive under distinct fields", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    renderSection();

    const index = new File(["signed index"], "ocr-index.json", { type: "application/json" });
    const archive = new File(["runtime"], "ocr-runtime.tar.gz", {
      type: "application/gzip",
    });
    const submit = screen.getByRole("button", { name: "Import from file" });

    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Signed OCR index (.json)"), {
      target: { files: [index] },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("OCR runtime archive (.tar.gz)"), {
      target: { files: [archive] },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = request.body as FormData;
    expect(body.get("index")).toBe(index);
    expect(body.get("archive")).toBe(archive);
    expect(body.has("file")).toBe(false);
  });

  it("retains the one-file field for legacy feature bundles", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    renderSection();

    fireEvent.click(screen.getByRole("radio", { name: "Legacy AI bundle" }));
    const archive = new File(["legacy"], "legacy-bundle.tar.gz", {
      type: "application/gzip",
    });
    fireEvent.change(screen.getByLabelText("Legacy bundle archive (.tar.gz)"), {
      target: { files: [archive] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import from file" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = request.body as FormData;
    expect(body.get("file")).toBe(archive);
    expect(body.has("index")).toBe(false);
    expect(body.has("archive")).toBe(false);
  });

  it("announces a server validation error without clearing the selected files", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Archive signature does not match the signed index" }),
    });
    renderSection();

    const indexInput = screen.getByLabelText<HTMLInputElement>("Signed OCR index (.json)");
    const archiveInput = screen.getByLabelText<HTMLInputElement>("OCR runtime archive (.tar.gz)");
    fireEvent.change(indexInput, {
      target: { files: [new File(["index"], "index.json")] },
    });
    fireEvent.change(archiveInput, {
      target: { files: [new File(["archive"], "runtime.tar.gz")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import from file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Archive signature does not match the signed index",
    );
    expect(indexInput.files).toHaveLength(1);
    expect(archiveInput.files).toHaveLength(1);
  });
});

describe("AI environment reset", () => {
  it("tells the admin when the reset left the shared venv in place", async () => {
    renderSection({ resetVenvKept: true });

    // Without this the admin sees a reset that looks fully successful while
    // the stale venv it was meant to clear is still there (#796).
    expect(
      await screen.findByText(/shared Python environment was left in place/i),
    ).toBeInTheDocument();
  });

  it("says nothing when the venv was reseeded", async () => {
    renderSection({ resetVenvKept: false });
    await waitFor(() => expect(apiGetMock).toHaveBeenCalled());

    expect(screen.queryByText(/shared Python environment was left in place/i)).toBeNull();
  });
});

describe("bundle install progress", () => {
  it("renders the rotating progress message from the active locale", async () => {
    const storage = new Map([["snapotter-locale", "de"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
      clear: () => storage.clear(),
    });
    vi.spyOn(Math, "random").mockReturnValue(0);
    const bundle: FeatureBundleState = {
      id: "background-removal",
      name: "Background Removal",
      description: "Remove backgrounds",
      status: "not_installed",
      installedVersion: null,
      estimatedSize: "4-5 GB",
      enablesTools: ["remove-background"],
      progress: null,
      error: null,
    };
    useFeaturesStore.setState({
      bundles: [bundle],
      loaded: true,
      loadError: false,
      installing: { [bundle.id]: { percent: 50, stage: "Downloading" } },
      errors: {},
      queued: [],
      installAllActive: false,
      startTimes: { [bundle.id]: Date.now() - 30_000 },
      fetch: vi.fn(async () => {}),
    });

    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    expect(await screen.findByText(de.features.progressMessages[0])).toBeInTheDocument();
    expect(screen.queryByText(en.features.progressMessages[0])).toBeNull();
  });
});
