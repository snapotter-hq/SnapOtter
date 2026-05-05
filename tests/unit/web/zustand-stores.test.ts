// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Bypass zustand persist middleware — it captures window.localStorage at import
// time before jsdom's storage is reliably available in the vitest fork pool.
vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    persist: (config: unknown) => config,
  };
});

// ---------------------------------------------------------------------------
// Global mocks
// ---------------------------------------------------------------------------

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:fake-url");

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL,
  revokeObjectURL,
});

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const storageMap = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, val: string) => storageMap.set(key, val)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  get length() {
    return storageMap.size;
  },
  key: vi.fn((_i: number) => null),
});

// Mock matchMedia for theme store
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
);

// ==========================================================================
// Base64Store
// ==========================================================================

import type { Base64Error, Base64Result } from "@/stores/base64-store";
import { useBase64Store } from "@/stores/base64-store";

describe("useBase64Store", () => {
  beforeEach(() => {
    useBase64Store.getState().reset();
  });

  it("has correct initial state", () => {
    const s = useBase64Store.getState();
    expect(s.results).toEqual([]);
    expect(s.errors).toEqual([]);
    expect(s.processing).toBe(false);
    expect(s.progress).toBeNull();
    expect(s.expandedIndex).toBe(0);
  });

  it("setResults stores results and errors, resets expandedIndex", () => {
    useBase64Store.getState().setExpandedIndex(3);
    const results: Base64Result[] = [
      {
        filename: "a.png",
        mimeType: "image/png",
        width: 100,
        height: 100,
        originalSize: 1024,
        encodedSize: 1365,
        overheadPercent: 33.3,
        base64: "abc",
        dataUri: "data:image/png;base64,abc",
      },
    ];
    const errors: Base64Error[] = [{ filename: "b.png", error: "too big" }];
    useBase64Store.getState().setResults(results, errors);

    const s = useBase64Store.getState();
    expect(s.results).toEqual(results);
    expect(s.errors).toEqual(errors);
    expect(s.expandedIndex).toBe(0);
  });

  it("setProcessing updates processing flag", () => {
    useBase64Store.getState().setProcessing(true);
    expect(useBase64Store.getState().processing).toBe(true);
    useBase64Store.getState().setProcessing(false);
    expect(useBase64Store.getState().processing).toBe(false);
  });

  it("setProgress updates progress", () => {
    const progress = { completed: 2, total: 5, currentFile: "c.png" };
    useBase64Store.getState().setProgress(progress);
    expect(useBase64Store.getState().progress).toEqual(progress);

    useBase64Store.getState().setProgress(null);
    expect(useBase64Store.getState().progress).toBeNull();
  });

  it("addResult appends to results array", () => {
    const r1: Base64Result = {
      filename: "a.png",
      mimeType: "image/png",
      width: 10,
      height: 10,
      originalSize: 100,
      encodedSize: 133,
      overheadPercent: 33,
      base64: "x",
      dataUri: "data:image/png;base64,x",
    };
    const r2: Base64Result = { ...r1, filename: "b.png" };

    useBase64Store.getState().addResult(r1);
    expect(useBase64Store.getState().results).toHaveLength(1);

    useBase64Store.getState().addResult(r2);
    expect(useBase64Store.getState().results).toHaveLength(2);
    expect(useBase64Store.getState().results[1].filename).toBe("b.png");
  });

  it("addError appends to errors array", () => {
    useBase64Store.getState().addError({ filename: "x.png", error: "fail" });
    useBase64Store.getState().addError({ filename: "y.png", error: "crash" });
    expect(useBase64Store.getState().errors).toHaveLength(2);
  });

  it("setExpandedIndex updates expanded index", () => {
    useBase64Store.getState().setExpandedIndex(5);
    expect(useBase64Store.getState().expandedIndex).toBe(5);
  });

  it("reset clears all state to initial values", () => {
    useBase64Store.getState().setProcessing(true);
    useBase64Store.getState().setProgress({ completed: 1, total: 2, currentFile: "f" });
    useBase64Store.getState().addResult({
      filename: "a.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      originalSize: 1,
      encodedSize: 1,
      overheadPercent: 0,
      base64: "",
      dataUri: "",
    });
    useBase64Store.getState().addError({ filename: "b.png", error: "err" });
    useBase64Store.getState().setExpandedIndex(2);

    useBase64Store.getState().reset();
    const s = useBase64Store.getState();
    expect(s.results).toEqual([]);
    expect(s.errors).toEqual([]);
    expect(s.processing).toBe(false);
    expect(s.progress).toBeNull();
    expect(s.expandedIndex).toBe(0);
  });
});

// ==========================================================================
// DuplicateStore
// ==========================================================================

import type { DuplicateResult } from "@/stores/duplicate-store";
import { useDuplicateStore } from "@/stores/duplicate-store";

describe("useDuplicateStore", () => {
  beforeEach(() => {
    useDuplicateStore.getState().reset();
  });

  it("has correct initial state", () => {
    const s = useDuplicateStore.getState();
    expect(s.results).toBeNull();
    expect(s.scanning).toBe(false);
    expect(s.viewMode).toBe("overview");
    expect(s.selectedGroupIndex).toBe(0);
    expect(s.bestOverrides).toEqual({});
  });

  it("setResults stores result and resets view state", () => {
    useDuplicateStore.getState().setViewMode("detail");
    useDuplicateStore.getState().setSelectedGroup(3);
    useDuplicateStore.getState().overrideBest(0, 2);

    const result: DuplicateResult = {
      totalImages: 10,
      uniqueImages: 7,
      spaceSaveable: 1024,
      duplicateGroups: [
        {
          groupId: 1,
          files: [
            {
              filename: "a.png",
              similarity: 0.99,
              width: 100,
              height: 100,
              fileSize: 512,
              format: "png",
              isBest: true,
              thumbnail: null,
            },
          ],
        },
      ],
    };
    useDuplicateStore.getState().setResults(result);

    const s = useDuplicateStore.getState();
    expect(s.results).toEqual(result);
    expect(s.viewMode).toBe("overview");
    expect(s.selectedGroupIndex).toBe(0);
    expect(s.bestOverrides).toEqual({});
  });

  it("setResults with null clears results", () => {
    useDuplicateStore.getState().setResults({
      totalImages: 1,
      uniqueImages: 1,
      spaceSaveable: 0,
      duplicateGroups: [],
    });
    useDuplicateStore.getState().setResults(null);
    expect(useDuplicateStore.getState().results).toBeNull();
  });

  it("setScanning updates scanning flag", () => {
    useDuplicateStore.getState().setScanning(true);
    expect(useDuplicateStore.getState().scanning).toBe(true);
  });

  it("setViewMode changes view mode", () => {
    useDuplicateStore.getState().setViewMode("detail");
    expect(useDuplicateStore.getState().viewMode).toBe("detail");
  });

  it("setSelectedGroup sets index and switches to detail view", () => {
    useDuplicateStore.getState().setSelectedGroup(2);
    expect(useDuplicateStore.getState().selectedGroupIndex).toBe(2);
    expect(useDuplicateStore.getState().viewMode).toBe("detail");
  });

  it("overrideBest accumulates overrides per group", () => {
    useDuplicateStore.getState().overrideBest(0, 1);
    useDuplicateStore.getState().overrideBest(2, 3);
    const overrides = useDuplicateStore.getState().bestOverrides;
    expect(overrides[0]).toBe(1);
    expect(overrides[2]).toBe(3);
  });

  it("overrideBest replaces previous override for same group", () => {
    useDuplicateStore.getState().overrideBest(0, 1);
    useDuplicateStore.getState().overrideBest(0, 2);
    expect(useDuplicateStore.getState().bestOverrides[0]).toBe(2);
  });

  it("reset clears everything", () => {
    useDuplicateStore.getState().setScanning(true);
    useDuplicateStore.getState().setViewMode("detail");
    useDuplicateStore.getState().setSelectedGroup(5);
    useDuplicateStore.getState().overrideBest(1, 2);

    useDuplicateStore.getState().reset();
    const s = useDuplicateStore.getState();
    expect(s.results).toBeNull();
    expect(s.scanning).toBe(false);
    expect(s.viewMode).toBe("overview");
    expect(s.selectedGroupIndex).toBe(0);
    expect(s.bestOverrides).toEqual({});
  });
});

// ==========================================================================
// PipelineStore
// ==========================================================================

import { usePipelineStore } from "@/stores/pipeline-store";

describe("usePipelineStore", () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it("has correct initial state", () => {
    const s = usePipelineStore.getState();
    expect(s.steps).toEqual([]);
    expect(s.expandedStepId).toBeNull();
    expect(s.savedPipelines).toEqual([]);
  });

  it("addStep adds a step with generated ID and expands it", () => {
    usePipelineStore.getState().addStep("resize");
    const s = usePipelineStore.getState();
    expect(s.steps).toHaveLength(1);
    expect(s.steps[0].toolId).toBe("resize");
    expect(s.steps[0].settings).toEqual({});
    expect(s.steps[0].id).toBeTruthy();
    expect(s.expandedStepId).toBe(s.steps[0].id);
  });

  it("addStep appends additional steps", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    const s = usePipelineStore.getState();
    expect(s.steps).toHaveLength(2);
    expect(s.steps[0].toolId).toBe("resize");
    expect(s.steps[1].toolId).toBe("compress");
    expect(s.expandedStepId).toBe(s.steps[1].id);
  });

  it("removeStep removes the step by id", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    const firstId = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().removeStep(firstId);
    expect(usePipelineStore.getState().steps).toHaveLength(1);
    expect(usePipelineStore.getState().steps[0].toolId).toBe("compress");
  });

  it("removeStep clears expandedStepId if removed step was expanded", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    expect(usePipelineStore.getState().expandedStepId).toBe(id);

    usePipelineStore.getState().removeStep(id);
    expect(usePipelineStore.getState().expandedStepId).toBeNull();
  });

  it("removeStep preserves expandedStepId if different step removed", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    const compressId = usePipelineStore.getState().steps[1].id;
    const resizeId = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().setExpandedStep(compressId);

    usePipelineStore.getState().removeStep(resizeId);
    expect(usePipelineStore.getState().expandedStepId).toBe(compressId);
  });

  it("reorderSteps swaps two steps", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    usePipelineStore.getState().addStep("convert");
    const ids = usePipelineStore.getState().steps.map((s) => s.id);

    usePipelineStore.getState().reorderSteps(ids[0], ids[2]);
    const steps = usePipelineStore.getState().steps;
    expect(steps[0].toolId).toBe("compress");
    expect(steps[1].toolId).toBe("convert");
    expect(steps[2].toolId).toBe("resize");
  });

  it("reorderSteps no-ops for invalid ids", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().reorderSteps("nonexistent", "also-nonexistent");
    expect(usePipelineStore.getState().steps).toHaveLength(1);
  });

  it("updateStepSettings merges settings into the step", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().updateStepSettings(id, { width: 800, height: 600 });
    expect(usePipelineStore.getState().steps[0].settings).toEqual({ width: 800, height: 600 });
  });

  it("updateStepSettings replaces settings entirely", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().updateStepSettings(id, { width: 800 });
    usePipelineStore.getState().updateStepSettings(id, { height: 600 });
    expect(usePipelineStore.getState().steps[0].settings).toEqual({ height: 600 });
  });

  it("setExpandedStep updates the expanded step", () => {
    usePipelineStore.getState().setExpandedStep("some-id");
    expect(usePipelineStore.getState().expandedStepId).toBe("some-id");
    usePipelineStore.getState().setExpandedStep(null);
    expect(usePipelineStore.getState().expandedStepId).toBeNull();
  });

  it("loadSteps replaces all steps with new ones and clears expanded", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().loadSteps([
      { toolId: "compress", settings: { quality: 80 } },
      { toolId: "convert", settings: { format: "webp" } },
    ]);

    const s = usePipelineStore.getState();
    expect(s.steps).toHaveLength(2);
    expect(s.steps[0].toolId).toBe("compress");
    expect(s.steps[0].settings).toEqual({ quality: 80 });
    expect(s.steps[1].toolId).toBe("convert");
    expect(s.expandedStepId).toBeNull();
  });

  it("setSavedPipelines stores the pipeline list", () => {
    const pipelines = [
      {
        id: "p1",
        name: "My Pipeline",
        description: "Test",
        steps: [{ toolId: "resize", settings: {} }],
        createdAt: "2024-01-01",
      },
    ];
    usePipelineStore.getState().setSavedPipelines(pipelines);
    expect(usePipelineStore.getState().savedPipelines).toEqual(pipelines);
  });

  it("reset clears all state", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().setSavedPipelines([
      {
        id: "p1",
        name: "P",
        description: null,
        steps: [],
        createdAt: "",
      },
    ]);

    usePipelineStore.getState().reset();
    const s = usePipelineStore.getState();
    expect(s.steps).toEqual([]);
    expect(s.expandedStepId).toBeNull();
    expect(s.savedPipelines).toEqual([]);
  });
});

// ==========================================================================
// QrStore
// ==========================================================================

import { encodeQrData, useQrStore } from "@/stores/qr-store";

describe("useQrStore", () => {
  beforeEach(() => {
    useQrStore.getState().reset();
  });

  it("has correct initial state", () => {
    const s = useQrStore.getState();
    expect(s.contentType).toBe("url");
    expect(s.textData).toBe("");
    expect(s.dotType).toBe("rounded");
    expect(s.dotColor).toBe("#000000");
    expect(s.bgColor).toBe("#FFFFFF");
    expect(s.bgTransparent).toBe(false);
    expect(s.size).toBe(1000);
    expect(s.errorCorrection).toBe("Q");
    expect(s.downloadFormat).toBe("png");
    expect(s.logoFile).toBeNull();
    expect(s.logoDataUrl).toBeNull();
    expect(s.logoSize).toBe(0.4);
    expect(s.hideBackgroundDots).toBe(true);
    expect(s.wifiData).toEqual({
      ssid: "",
      password: "",
      encryption: "WPA",
      hidden: false,
    });
  });

  it("setContentType changes content type", () => {
    useQrStore.getState().setContentType("wifi");
    expect(useQrStore.getState().contentType).toBe("wifi");
  });

  it("setTextData updates text data", () => {
    useQrStore.getState().setTextData("https://example.com");
    expect(useQrStore.getState().textData).toBe("https://example.com");
  });

  it("setWifiData merges partial wifi data", () => {
    useQrStore.getState().setWifiData({ ssid: "MyNetwork" });
    const wifi = useQrStore.getState().wifiData;
    expect(wifi.ssid).toBe("MyNetwork");
    expect(wifi.encryption).toBe("WPA"); // unchanged

    useQrStore.getState().setWifiData({ password: "secret123" });
    expect(useQrStore.getState().wifiData.ssid).toBe("MyNetwork");
    expect(useQrStore.getState().wifiData.password).toBe("secret123");
  });

  it("setVcardData merges partial vcard data", () => {
    useQrStore.getState().setVcardData({ firstName: "John", lastName: "Doe" });
    const vcard = useQrStore.getState().vcardData;
    expect(vcard.firstName).toBe("John");
    expect(vcard.lastName).toBe("Doe");
    expect(vcard.phone).toBe(""); // unchanged
  });

  it("setEmailData merges partial email data", () => {
    useQrStore.getState().setEmailData({ to: "a@b.com", subject: "Hi" });
    expect(useQrStore.getState().emailData.to).toBe("a@b.com");
    expect(useQrStore.getState().emailData.subject).toBe("Hi");
    expect(useQrStore.getState().emailData.body).toBe(""); // unchanged
  });

  it("setSmsData merges partial sms data", () => {
    useQrStore.getState().setSmsData({ phone: "+1234567890" });
    expect(useQrStore.getState().smsData.phone).toBe("+1234567890");
    expect(useQrStore.getState().smsData.message).toBe("");
  });

  it("setDotColor updates dot color", () => {
    useQrStore.getState().setDotColor("#FF0000");
    expect(useQrStore.getState().dotColor).toBe("#FF0000");
  });

  it("setBgTransparent toggles background transparency", () => {
    useQrStore.getState().setBgTransparent(true);
    expect(useQrStore.getState().bgTransparent).toBe(true);
  });

  it("setSize updates size", () => {
    useQrStore.getState().setSize(500);
    expect(useQrStore.getState().size).toBe(500);
  });

  it("setErrorCorrection updates error correction level", () => {
    useQrStore.getState().setErrorCorrection("H");
    expect(useQrStore.getState().errorCorrection).toBe("H");
  });

  it("setDownloadFormat updates download format", () => {
    useQrStore.getState().setDownloadFormat("svg");
    expect(useQrStore.getState().downloadFormat).toBe("svg");
  });

  it("setLogoFile with null clears logo data", () => {
    useQrStore.getState().setLogoFile(null);
    expect(useQrStore.getState().logoFile).toBeNull();
    expect(useQrStore.getState().logoDataUrl).toBeNull();
  });

  it("reset restores all defaults", () => {
    useQrStore.getState().setContentType("wifi");
    useQrStore.getState().setTextData("changed");
    useQrStore.getState().setDotColor("#FF0000");
    useQrStore.getState().setSize(500);
    useQrStore.getState().setWifiData({ ssid: "test" });

    useQrStore.getState().reset();
    const s = useQrStore.getState();
    expect(s.contentType).toBe("url");
    expect(s.textData).toBe("");
    expect(s.dotColor).toBe("#000000");
    expect(s.size).toBe(1000);
    expect(s.wifiData.ssid).toBe("");
  });
});

describe("encodeQrData", () => {
  it("encodes url/text content type as plain text", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "url" as const,
      textData: "https://example.com",
    };
    expect(encodeQrData(state)).toBe("https://example.com");
  });

  it("encodes text content type as plain text", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "text" as const,
      textData: "Hello World",
    };
    expect(encodeQrData(state)).toBe("Hello World");
  });

  it("encodes wifi data in WIFI: format", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "wifi" as const,
      wifiData: { ssid: "MyNet", password: "pass123", encryption: "WPA" as const, hidden: false },
    };
    expect(encodeQrData(state)).toBe("WIFI:T:WPA;S:MyNet;P:pass123;H:false;;");
  });

  it("encodes vcard data in vCard 3.0 format", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "vcard" as const,
      vcardData: {
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
        email: "john@example.com",
        organization: "Acme",
        title: "Engineer",
        url: "https://johndoe.com",
      },
    };
    const result = encodeQrData(state);
    expect(result).toContain("BEGIN:VCARD");
    expect(result).toContain("VERSION:3.0");
    expect(result).toContain("N:Doe;John");
    expect(result).toContain("FN:John Doe");
    expect(result).toContain("TEL:+1234567890");
    expect(result).toContain("EMAIL:john@example.com");
    expect(result).toContain("ORG:Acme");
    expect(result).toContain("TITLE:Engineer");
    expect(result).toContain("URL:https://johndoe.com");
    expect(result).toContain("END:VCARD");
  });

  it("encodes vcard without optional fields", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "vcard" as const,
      vcardData: {
        firstName: "Jane",
        lastName: "",
        phone: "",
        email: "",
        organization: "",
        title: "",
        url: "",
      },
    };
    const result = encodeQrData(state);
    expect(result).toContain("FN:Jane");
    expect(result).not.toContain("TEL:");
    expect(result).not.toContain("EMAIL:");
  });

  it("encodes email data as mailto URI", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "email" as const,
      emailData: { to: "test@example.com", subject: "Hello World", body: "Hi there" },
    };
    const result = encodeQrData(state);
    expect(result).toContain("mailto:test@example.com");
    expect(result).toContain("subject=Hello%20World");
    expect(result).toContain("body=Hi%20there");
  });

  it("encodes email without subject/body", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "email" as const,
      emailData: { to: "plain@test.com", subject: "", body: "" },
    };
    expect(encodeQrData(state)).toBe("mailto:plain@test.com");
  });

  it("encodes phone data as tel URI", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "phone" as const,
      phoneData: "+1234567890",
    };
    expect(encodeQrData(state)).toBe("tel:+1234567890");
  });

  it("encodes sms data as smsto URI", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "sms" as const,
      smsData: { phone: "+1234567890", message: "Hey!" },
    };
    expect(encodeQrData(state)).toBe("smsto:+1234567890:Hey!");
  });
});

// ==========================================================================
// SplitStore
// ==========================================================================

import { useSplitStore } from "@/stores/split-store";

describe("useSplitStore", () => {
  beforeEach(() => {
    revokeObjectURL.mockClear();
    useSplitStore.setState({
      mode: "grid",
      columns: 3,
      rows: 3,
      tileWidth: 200,
      tileHeight: 200,
      outputFormat: "original",
      quality: 90,
      imageDimensions: null,
      processing: false,
      error: null,
      tiles: [],
      zipBlobUrl: null,
    });
  });

  it("has correct initial state", () => {
    const s = useSplitStore.getState();
    expect(s.mode).toBe("grid");
    expect(s.columns).toBe(3);
    expect(s.rows).toBe(3);
    expect(s.tileWidth).toBe(200);
    expect(s.tileHeight).toBe(200);
    expect(s.outputFormat).toBe("original");
    expect(s.quality).toBe(90);
    expect(s.imageDimensions).toBeNull();
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
    expect(s.tiles).toEqual([]);
    expect(s.zipBlobUrl).toBeNull();
  });

  it("setMode changes mode and clears tiles/zip/error", () => {
    useSplitStore.getState().setTiles([
      {
        row: 0,
        col: 0,
        label: "1",
        width: 100,
        height: 100,
        blobUrl: null,
      },
    ]);
    useSplitStore.getState().setMode("tile-size");
    const s = useSplitStore.getState();
    expect(s.mode).toBe("tile-size");
    expect(s.tiles).toEqual([]);
    expect(s.error).toBeNull();
  });

  it("setColumns clamps to 1-100 range", () => {
    useSplitStore.getState().setColumns(0);
    expect(useSplitStore.getState().columns).toBe(1);

    useSplitStore.getState().setColumns(150);
    expect(useSplitStore.getState().columns).toBe(100);

    useSplitStore.getState().setColumns(5);
    expect(useSplitStore.getState().columns).toBe(5);
  });

  it("setRows clamps to 1-100 range", () => {
    useSplitStore.getState().setRows(-1);
    expect(useSplitStore.getState().rows).toBe(1);

    useSplitStore.getState().setRows(200);
    expect(useSplitStore.getState().rows).toBe(100);
  });

  it("setTileWidth clamps to minimum 10", () => {
    useSplitStore.getState().setTileWidth(5);
    expect(useSplitStore.getState().tileWidth).toBe(10);

    useSplitStore.getState().setTileWidth(300);
    expect(useSplitStore.getState().tileWidth).toBe(300);
  });

  it("setTileHeight clamps to minimum 10", () => {
    useSplitStore.getState().setTileHeight(1);
    expect(useSplitStore.getState().tileHeight).toBe(10);
  });

  it("setZipBlobUrl revokes previous URL", () => {
    useSplitStore.setState({ zipBlobUrl: "blob:old-zip" });
    revokeObjectURL.mockClear();

    useSplitStore.getState().setZipBlobUrl("blob:new-zip");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:old-zip");
    expect(useSplitStore.getState().zipBlobUrl).toBe("blob:new-zip");
  });

  it("applyPreset sets mode to grid with given cols/rows", () => {
    useSplitStore.getState().applyPreset(4, 4);
    const s = useSplitStore.getState();
    expect(s.mode).toBe("grid");
    expect(s.columns).toBe(4);
    expect(s.rows).toBe(4);
    expect(s.tiles).toEqual([]);
  });

  it("getEffectiveGrid returns columns/rows in grid mode", () => {
    useSplitStore.getState().setColumns(5);
    useSplitStore.getState().setRows(3);
    const grid = useSplitStore.getState().getEffectiveGrid();
    expect(grid).toEqual({ columns: 5, rows: 3 });
  });

  it("getEffectiveGrid computes from tile size in tile-size mode", () => {
    useSplitStore.getState().setMode("tile-size");
    useSplitStore.getState().setTileWidth(100);
    useSplitStore.getState().setTileHeight(50);
    useSplitStore.getState().setImageDimensions({ width: 300, height: 200 });
    const grid = useSplitStore.getState().getEffectiveGrid();
    expect(grid).toEqual({ columns: 3, rows: 4 });
  });

  it("getTileCount returns columns * rows", () => {
    useSplitStore.getState().setColumns(4);
    useSplitStore.getState().setRows(3);
    expect(useSplitStore.getState().getTileCount()).toBe(12);
  });

  it("getComputedTileDimensions returns null without image dimensions", () => {
    expect(useSplitStore.getState().getComputedTileDimensions()).toBeNull();
  });

  it("getComputedTileDimensions computes tile size in grid mode", () => {
    useSplitStore.getState().setImageDimensions({ width: 900, height: 600 });
    useSplitStore.getState().setColumns(3);
    useSplitStore.getState().setRows(2);
    const dims = useSplitStore.getState().getComputedTileDimensions();
    expect(dims).toEqual({ width: 300, height: 300 });
  });

  it("getComputedTileDimensions returns tile size in tile-size mode", () => {
    useSplitStore.getState().setMode("tile-size");
    useSplitStore.getState().setTileWidth(150);
    useSplitStore.getState().setTileHeight(75);
    useSplitStore.getState().setImageDimensions({ width: 600, height: 300 });
    const dims = useSplitStore.getState().getComputedTileDimensions();
    expect(dims).toEqual({ width: 150, height: 75 });
  });

  it("reset revokes zip and tile blob URLs", () => {
    useSplitStore.setState({
      zipBlobUrl: "blob:zip",
      tiles: [
        { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:tile1" },
        { row: 0, col: 1, label: "2", width: 100, height: 100, blobUrl: null },
      ],
    });
    revokeObjectURL.mockClear();

    useSplitStore.getState().reset();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:zip");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:tile1");
    expect(useSplitStore.getState().tiles).toEqual([]);
    expect(useSplitStore.getState().zipBlobUrl).toBeNull();
  });
});

// ==========================================================================
// ThemeStore
// ==========================================================================

import { useThemeStore } from "@/stores/theme-store";

describe("useThemeStore", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "light", resolvedTheme: "light" });
    localStorage.removeItem("snapotter-theme-user-set");
  });

  it("has correct initial state", () => {
    const s = useThemeStore.getState();
    expect(s.theme).toBe("light");
    expect(s.resolvedTheme).toBe("light");
  });

  it("setTheme to dark updates theme and resolvedTheme", () => {
    useThemeStore.getState().setTheme("dark");
    const s = useThemeStore.getState();
    expect(s.theme).toBe("dark");
    expect(s.resolvedTheme).toBe("dark");
  });

  it("setTheme to light updates theme and resolvedTheme", () => {
    useThemeStore.getState().setTheme("dark");
    useThemeStore.getState().setTheme("light");
    const s = useThemeStore.getState();
    expect(s.theme).toBe("light");
    expect(s.resolvedTheme).toBe("light");
  });

  it("setTheme to system resolves based on matchMedia", () => {
    useThemeStore.getState().setTheme("system");
    const s = useThemeStore.getState();
    expect(s.theme).toBe("system");
    // matchMedia mock returns matches: false, so system resolves to "light"
    expect(s.resolvedTheme).toBe("light");
  });

  it("setTheme sets user-set flag in localStorage", () => {
    useThemeStore.getState().setTheme("dark");
    expect(localStorage.getItem("snapotter-theme-user-set")).toBe("1");
  });

  it("applyServerDefault applies theme when no user-set flag", () => {
    useThemeStore.getState().applyServerDefault("dark");
    const s = useThemeStore.getState();
    expect(s.theme).toBe("dark");
    expect(s.resolvedTheme).toBe("dark");
  });

  it("applyServerDefault skips when user-set flag exists", () => {
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().applyServerDefault("dark");
    const s = useThemeStore.getState();
    expect(s.theme).toBe("light");
    expect(s.resolvedTheme).toBe("light");
  });

  it("applyServerDefault does not set user-set flag", () => {
    useThemeStore.getState().applyServerDefault("dark");
    expect(localStorage.getItem("snapotter-theme-user-set")).toBeNull();
  });
});

// ==========================================================================
// PdfToImageStore (synchronous state operations only)
// ==========================================================================

import { usePdfToImageStore } from "@/stores/pdf-to-image-store";

describe("usePdfToImageStore", () => {
  beforeEach(() => {
    usePdfToImageStore.getState().reset();
  });

  it("has correct initial state", () => {
    const s = usePdfToImageStore.getState();
    expect(s.file).toBeNull();
    expect(s.pageCount).toBeNull();
    expect(s.thumbnails).toEqual([]);
    expect(s.format).toBe("png");
    expect(s.dpi).toBe(150);
    expect(s.customDpi).toBe(false);
    expect(s.quality).toBe(85);
    expect(s.colorMode).toBe("color");
    expect(s.pages).toBe("");
    expect(s.selectedPages.size).toBe(0);
    expect(s.processing).toBe(false);
    expect(s.loadingPreview).toBe(false);
    expect(s.error).toBeNull();
    expect(s.results).toBeNull();
    expect(s.zipUrl).toBeNull();
    expect(s.zipSize).toBeNull();
  });

  it("setFormat updates format", () => {
    usePdfToImageStore.getState().setFormat("jpg");
    expect(usePdfToImageStore.getState().format).toBe("jpg");
  });

  it("setDpi updates dpi", () => {
    usePdfToImageStore.getState().setDpi(300);
    expect(usePdfToImageStore.getState().dpi).toBe(300);
  });

  it("setCustomDpi updates customDpi flag", () => {
    usePdfToImageStore.getState().setCustomDpi(true);
    expect(usePdfToImageStore.getState().customDpi).toBe(true);
  });

  it("setQuality updates quality", () => {
    usePdfToImageStore.getState().setQuality(50);
    expect(usePdfToImageStore.getState().quality).toBe(50);
  });

  it("setColorMode updates color mode", () => {
    usePdfToImageStore.getState().setColorMode("grayscale");
    expect(usePdfToImageStore.getState().colorMode).toBe("grayscale");
  });

  it("setFile with null resets to initial state", () => {
    usePdfToImageStore.getState().setFormat("jpg");
    usePdfToImageStore.getState().setDpi(300);
    usePdfToImageStore.getState().setFile(null);
    const s = usePdfToImageStore.getState();
    expect(s.file).toBeNull();
    // format and dpi are part of initialState spread, so they also reset
    expect(s.format).toBe("png");
    expect(s.dpi).toBe(150);
  });

  it("setFile with a File resets results and pages", () => {
    const file = new File(["pdf content"], "test.pdf", { type: "application/pdf" });
    usePdfToImageStore.getState().setFile(file);
    const s = usePdfToImageStore.getState();
    expect(s.file).toBe(file);
    expect(s.pageCount).toBeNull();
    expect(s.thumbnails).toEqual([]);
    expect(s.results).toBeNull();
    expect(s.error).toBeNull();
    expect(s.selectedPages.size).toBe(0);
    expect(s.pages).toBe("");
  });

  it("togglePage adds and removes pages", () => {
    usePdfToImageStore.setState({ pageCount: 5 });
    usePdfToImageStore.getState().togglePage(3);
    expect(usePdfToImageStore.getState().selectedPages.has(3)).toBe(true);

    usePdfToImageStore.getState().togglePage(3);
    expect(usePdfToImageStore.getState().selectedPages.has(3)).toBe(false);
  });

  it("selectAllPages selects all pages when pageCount is set", () => {
    usePdfToImageStore.setState({ pageCount: 4 });
    usePdfToImageStore.getState().selectAllPages();
    const pages = usePdfToImageStore.getState().selectedPages;
    expect(pages.size).toBe(4);
    expect(pages.has(1)).toBe(true);
    expect(pages.has(4)).toBe(true);
    expect(usePdfToImageStore.getState().pages).toBe("");
  });

  it("selectAllPages is a no-op when pageCount is null", () => {
    usePdfToImageStore.getState().selectAllPages();
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(0);
  });

  it("deselectAllPages clears selection and sets pages to 'none'", () => {
    usePdfToImageStore.setState({ pageCount: 3 });
    usePdfToImageStore.getState().selectAllPages();
    usePdfToImageStore.getState().deselectAllPages();
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(0);
    expect(usePdfToImageStore.getState().pages).toBe("none");
  });

  it("reset restores initial state", () => {
    usePdfToImageStore.getState().setFormat("webp");
    usePdfToImageStore.getState().setDpi(600);
    usePdfToImageStore.setState({ processing: true, error: "something" });

    usePdfToImageStore.getState().reset();
    const s = usePdfToImageStore.getState();
    expect(s.format).toBe("png");
    expect(s.dpi).toBe(150);
    expect(s.processing).toBe(false);
    expect(s.error).toBeNull();
  });

  // -- setPages (page range parsing) ----------------------------------------

  it("setPages with valid range sets selectedPages from parsed range", () => {
    usePdfToImageStore.setState({ pageCount: 10 });
    usePdfToImageStore.getState().setPages("1-3, 5");
    const s = usePdfToImageStore.getState();
    expect(s.pages).toBe("1-3, 5");
    expect(s.selectedPages.size).toBe(4);
    expect(s.selectedPages.has(1)).toBe(true);
    expect(s.selectedPages.has(2)).toBe(true);
    expect(s.selectedPages.has(3)).toBe(true);
    expect(s.selectedPages.has(5)).toBe(true);
  });

  it("setPages with 'all' selects all pages", () => {
    usePdfToImageStore.setState({ pageCount: 5 });
    usePdfToImageStore.getState().setPages("all");
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(5);
  });

  it("setPages with empty string selects all pages", () => {
    usePdfToImageStore.setState({ pageCount: 3 });
    usePdfToImageStore.getState().setPages("");
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(3);
  });

  it("setPages with invalid range falls back to all pages", () => {
    usePdfToImageStore.setState({ pageCount: 4 });
    usePdfToImageStore.getState().setPages("5-3"); // invalid: start > end
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(4);
  });

  it("setPages with out-of-range page falls back to all pages", () => {
    usePdfToImageStore.setState({ pageCount: 3 });
    usePdfToImageStore.getState().setPages("5"); // page 5 > pageCount 3
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(3);
  });

  it("setPages with null pageCount yields empty selectedPages", () => {
    // pageCount is null by default after reset
    usePdfToImageStore.getState().setPages("1-3");
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(0);
  });

  it("setPages with single page number", () => {
    usePdfToImageStore.setState({ pageCount: 10 });
    usePdfToImageStore.getState().setPages("7");
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(1);
    expect(usePdfToImageStore.getState().selectedPages.has(7)).toBe(true);
  });

  // -- togglePage generates compact range strings ---------------------------

  it("togglePage updates pages string as compact range", () => {
    usePdfToImageStore.setState({ pageCount: 5 });
    usePdfToImageStore.getState().togglePage(1);
    usePdfToImageStore.getState().togglePage(2);
    usePdfToImageStore.getState().togglePage(3);
    expect(usePdfToImageStore.getState().pages).toBe("1-3");
  });

  it("togglePage with non-contiguous pages shows individual values", () => {
    usePdfToImageStore.setState({ pageCount: 10 });
    usePdfToImageStore.getState().togglePage(1);
    usePdfToImageStore.getState().togglePage(5);
    expect(usePdfToImageStore.getState().pages).toBe("1, 5");
  });

  it("togglePage clearing all pages sets empty pages string", () => {
    usePdfToImageStore.setState({ pageCount: 2 });
    usePdfToImageStore.getState().togglePage(1);
    usePdfToImageStore.getState().togglePage(1); // untoggle
    expect(usePdfToImageStore.getState().pages).toBe("");
    expect(usePdfToImageStore.getState().selectedPages.size).toBe(0);
  });

  // -- loadPreview ----------------------------------------------------------

  it("loadPreview fetches preview and sets pageCount and thumbnails", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          pageCount: 3,
          thumbnails: [{ page: 1, dataUrl: "data:...", width: 100, height: 150 }],
        }),
    });

    await usePdfToImageStore.getState().loadPreview(file);

    const s = usePdfToImageStore.getState();
    expect(s.pageCount).toBe(3);
    expect(s.thumbnails).toHaveLength(1);
    expect(s.selectedPages.size).toBe(3);
    expect(s.loadingPreview).toBe(false);
  });

  it("loadPreview sets error on HTTP failure", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    await usePdfToImageStore.getState().loadPreview(file);

    const s = usePdfToImageStore.getState();
    expect(s.error).toBe("Server error");
    expect(s.file).toBeNull();
    expect(s.pageCount).toBeNull();
    expect(s.loadingPreview).toBe(false);
  });

  it("loadPreview sets error on fetch failure with fallback", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });

    await usePdfToImageStore.getState().loadPreview(file);

    expect(usePdfToImageStore.getState().error).toBe("Failed: 500");
  });

  it("loadPreview sets error on network exception", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fetchMock.mockRejectedValueOnce(new Error("Network error"));

    await usePdfToImageStore.getState().loadPreview(file);

    expect(usePdfToImageStore.getState().error).toBe("Network error");
    expect(usePdfToImageStore.getState().loadingPreview).toBe(false);
  });

  it("loadPreview sets generic error for non-Error throws", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    fetchMock.mockRejectedValueOnce("string error");

    await usePdfToImageStore.getState().loadPreview(file);

    expect(usePdfToImageStore.getState().error).toBe("Failed to read PDF");
  });

  // -- convert --------------------------------------------------------------

  it("convert sends file with settings and stores results", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({
      file,
      format: "jpg",
      dpi: 300,
      quality: 90,
      colorMode: "grayscale",
      pages: "",
      selectedPages: new Set([1, 2]),
      pageCount: 3,
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          pages: [{ page: 1, downloadUrl: "/dl/1", size: 100 }],
          zipUrl: "/dl/zip",
          zipSize: 500,
        }),
    });

    await usePdfToImageStore.getState().convert();

    const s = usePdfToImageStore.getState();
    expect(s.results).toHaveLength(1);
    expect(s.zipUrl).toBe("/dl/zip");
    expect(s.zipSize).toBe(500);
    expect(s.processing).toBe(false);
  });

  it("convert is a no-op when no file is set", async () => {
    const callsBefore = fetchMock.mock.calls.length;
    await usePdfToImageStore.getState().convert();

    // No new fetch calls should have been made
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
    expect(usePdfToImageStore.getState().processing).toBe(false);
  });

  it("convert sets error on HTTP failure", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({ file, pageCount: 2 });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: "Conversion error" }),
    });

    await usePdfToImageStore.getState().convert();

    expect(usePdfToImageStore.getState().error).toBe("Conversion error");
    expect(usePdfToImageStore.getState().processing).toBe(false);
  });

  it("convert sets error on network exception", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({ file, pageCount: 2 });

    fetchMock.mockRejectedValueOnce(new Error("Offline"));

    await usePdfToImageStore.getState().convert();

    expect(usePdfToImageStore.getState().error).toBe("Offline");
    expect(usePdfToImageStore.getState().processing).toBe(false);
  });

  it("convert sets generic error for non-Error throws", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({ file, pageCount: 2 });

    fetchMock.mockRejectedValueOnce(42);

    await usePdfToImageStore.getState().convert();

    expect(usePdfToImageStore.getState().error).toBe("Conversion failed");
  });

  it("convert uses 'all' when pages is empty", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({
      file,
      pages: "",
      selectedPages: new Set([1, 2, 3]),
      pageCount: 3,
    });

    let capturedFormData: FormData | null = null;
    fetchMock.mockImplementationOnce((_url: string, opts: { body: FormData }) => {
      capturedFormData = opts.body;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ pages: [], zipUrl: null, zipSize: null }),
      });
    });

    await usePdfToImageStore.getState().convert();

    expect(capturedFormData).not.toBeNull();
    // FormData.get works in jsdom when appended synchronously
    const settings = capturedFormData!.get("settings");
    expect(settings).not.toBeNull();
    const parsed = JSON.parse(settings as string);
    expect(parsed.pages).toBe("all");
  });

  it("convert sends compact page range for specific selection", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({
      file,
      pages: "1-2",
      selectedPages: new Set([1, 2]),
      pageCount: 5,
    });

    let capturedFormData: FormData | null = null;
    fetchMock.mockImplementationOnce((_url: string, opts: { body: FormData }) => {
      capturedFormData = opts.body;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ pages: [], zipUrl: null, zipSize: null }),
      });
    });

    await usePdfToImageStore.getState().convert();

    expect(capturedFormData).not.toBeNull();
    const settings = capturedFormData!.get("settings");
    expect(settings).not.toBeNull();
    const parsed = JSON.parse(settings as string);
    expect(parsed.pages).toBe("1-2");
  });

  it("convert handles JSON parse failure on error response", async () => {
    const file = new File(["pdf"], "doc.pdf", { type: "application/pdf" });
    usePdfToImageStore.setState({ file, pageCount: 2 });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("bad json")),
    });

    await usePdfToImageStore.getState().convert();

    expect(usePdfToImageStore.getState().error).toBe("Conversion failed: 500");
  });
});

// ==========================================================================
// CollageStore
// ==========================================================================

// Mock the collage-templates module so we don't depend on real template data.
// The store uses getDefaultTemplate() and COLLAGE_TEMPLATES — provide
// minimal stubs that return predictable values.
vi.mock("@/lib/collage-templates", () => ({
  COLLAGE_TEMPLATES: [
    {
      id: "2-h-equal",
      imageCount: 2,
      label: "Side by side",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr",
      cells: [
        { gridColumn: "1", gridRow: "1" },
        { gridColumn: "2", gridRow: "1" },
      ],
    },
    {
      id: "3-h-equal",
      imageCount: 3,
      label: "Three across",
      gridTemplateColumns: "1fr 1fr 1fr",
      gridTemplateRows: "1fr",
      cells: [
        { gridColumn: "1", gridRow: "1" },
        { gridColumn: "2", gridRow: "1" },
        { gridColumn: "3", gridRow: "1" },
      ],
    },
  ],
  getDefaultTemplate: (count: number) => {
    if (count >= 3) {
      return {
        id: "3-h-equal",
        imageCount: 3,
        cells: [
          { gridColumn: "1", gridRow: "1" },
          { gridColumn: "2", gridRow: "1" },
          { gridColumn: "3", gridRow: "1" },
        ],
      };
    }
    return {
      id: "2-h-equal",
      imageCount: 2,
      cells: [
        { gridColumn: "1", gridRow: "1" },
        { gridColumn: "2", gridRow: "1" },
      ],
    };
  },
}));

// Mock image-preview helpers to avoid real fetch calls
vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { useCollageStore } from "@/stores/collage-store";

describe("useCollageStore", () => {
  beforeEach(() => {
    revokeObjectURL.mockClear();
    createObjectURL.mockClear();
    useCollageStore.getState().reset();
  });

  it("has correct initial state", () => {
    const s = useCollageStore.getState();
    expect(s.images).toEqual([]);
    expect(s.templateId).toBe("2-h-equal");
    expect(s.cellAssignments).toEqual([]);
    expect(s.cellTransforms).toEqual({});
    expect(s.gap).toBe(8);
    expect(s.cornerRadius).toBe(0);
    expect(s.backgroundColor).toBe("#FFFFFF");
    expect(s.bgPreset).toBe("white");
    expect(s.aspectRatio).toBe("free");
    expect(s.outputFormat).toBe("png");
    expect(s.quality).toBe(90);
    expect(s.selectedCell).toBeNull();
    expect(s.phase).toBe("upload");
    expect(s.progress).toBe(0);
    expect(s.resultUrl).toBeNull();
    expect(s.resultSize).toBeNull();
    expect(s.originalSize).toBeNull();
    expect(s.error).toBeNull();
    expect(s.jobId).toBeNull();
  });

  it("addImages creates CollageImage entries and transitions to editing phase", () => {
    const file1 = new File(["a"], "photo1.png", { type: "image/png" });
    const file2 = new File(["b"], "photo2.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);

    const s = useCollageStore.getState();
    expect(s.images).toHaveLength(2);
    expect(s.images[0].file).toBe(file1);
    expect(s.images[0].blobUrl).toBe("blob:fake-url");
    expect(s.images[1].file).toBe(file2);
    expect(s.phase).toBe("editing");
    expect(s.templateId).toBe("2-h-equal");
    expect(s.cellAssignments).toHaveLength(2);
    expect(s.cellAssignments[0]).toBe(0);
    expect(s.cellAssignments[1]).toBe(1);
  });

  it("addImages appends to existing images", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    const file2 = new File(["b"], "b.png", { type: "image/png" });
    const file3 = new File(["c"], "c.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);
    useCollageStore.getState().addImages([file3]);

    const s = useCollageStore.getState();
    expect(s.images).toHaveLength(3);
    expect(s.templateId).toBe("3-h-equal");
  });

  it("removeImage removes image by index and revokes blob URL", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    const file2 = new File(["b"], "b.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);
    revokeObjectURL.mockClear();

    useCollageStore.getState().removeImage(0);

    const s = useCollageStore.getState();
    expect(s.images).toHaveLength(1);
    expect(s.images[0].file).toBe(file2);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("removeImage resets when last image is removed", () => {
    const file = new File(["a"], "a.png", { type: "image/png" });
    useCollageStore.getState().addImages([file]);

    useCollageStore.getState().removeImage(0);
    const s = useCollageStore.getState();
    expect(s.images).toEqual([]);
    expect(s.phase).toBe("upload");
  });

  it("clearImages revokes all blob URLs and resets to upload phase", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    const file2 = new File(["b"], "b.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);
    revokeObjectURL.mockClear();

    useCollageStore.getState().clearImages();

    const s = useCollageStore.getState();
    expect(s.images).toEqual([]);
    expect(s.phase).toBe("upload");
    expect(s.cellAssignments).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("setTemplateId changes template and rebuilds assignments", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1]);
    useCollageStore.getState().setTemplateId("3-h-equal");

    const s = useCollageStore.getState();
    expect(s.templateId).toBe("3-h-equal");
    expect(s.cellAssignments).toHaveLength(3);
    expect(s.cellAssignments[0]).toBe(0);
    expect(s.cellAssignments[1]).toBe(-1);
    expect(s.cellAssignments[2]).toBe(-1);
    expect(s.cellTransforms).toEqual({});
  });

  it("setTemplateId ignores unknown template IDs", () => {
    useCollageStore.getState().setTemplateId("nonexistent");
    expect(useCollageStore.getState().templateId).toBe("2-h-equal");
  });

  it("setCellAssignment updates a single cell", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    const file2 = new File(["b"], "b.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);

    useCollageStore.getState().setCellAssignment(0, 1);
    expect(useCollageStore.getState().cellAssignments[0]).toBe(1);
    expect(useCollageStore.getState().resultUrl).toBeNull();
  });

  it("swapCells swaps assignments and transforms between two cells", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    const file2 = new File(["b"], "b.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1, file2]);

    useCollageStore.getState().setCellTransform(0, { zoom: 2 });

    useCollageStore.getState().swapCells(0, 1);

    const s = useCollageStore.getState();
    expect(s.cellAssignments[0]).toBe(1);
    expect(s.cellAssignments[1]).toBe(0);
    expect(s.cellTransforms[1]?.zoom).toBe(2);
  });

  it("setCellTransform creates and merges transforms", () => {
    useCollageStore.getState().setCellTransform(0, { panX: 50 });
    expect(useCollageStore.getState().cellTransforms[0].panX).toBe(50);
    expect(useCollageStore.getState().cellTransforms[0].zoom).toBe(1);

    useCollageStore.getState().setCellTransform(0, { zoom: 2.5 });
    expect(useCollageStore.getState().cellTransforms[0].panX).toBe(50);
    expect(useCollageStore.getState().cellTransforms[0].zoom).toBe(2.5);
  });

  it("resetCellTransform removes transform for a cell", () => {
    useCollageStore.getState().setCellTransform(0, { zoom: 2 });
    expect(useCollageStore.getState().cellTransforms[0]).toBeDefined();

    useCollageStore.getState().resetCellTransform(0);
    expect(useCollageStore.getState().cellTransforms[0]).toBeUndefined();
  });

  it("setGap updates gap and clears resultUrl", () => {
    useCollageStore.setState({ resultUrl: "blob:old" });
    useCollageStore.getState().setGap(16);
    expect(useCollageStore.getState().gap).toBe(16);
    expect(useCollageStore.getState().resultUrl).toBeNull();
  });

  it("setCornerRadius updates corner radius", () => {
    useCollageStore.getState().setCornerRadius(12);
    expect(useCollageStore.getState().cornerRadius).toBe(12);
  });

  it("setBackgroundColor updates backgroundColor", () => {
    useCollageStore.getState().setBackgroundColor("#FF0000");
    expect(useCollageStore.getState().backgroundColor).toBe("#FF0000");
  });

  it("setBgPreset updates preset and color for named presets", () => {
    useCollageStore.getState().setBgPreset("black");
    expect(useCollageStore.getState().bgPreset).toBe("black");
    expect(useCollageStore.getState().backgroundColor).toBe("#000000");

    useCollageStore.getState().setBgPreset("transparent");
    expect(useCollageStore.getState().backgroundColor).toBe("transparent");
  });

  it("setBgPreset with custom does not overwrite backgroundColor", () => {
    useCollageStore.getState().setBackgroundColor("#123456");
    useCollageStore.getState().setBgPreset("custom");
    expect(useCollageStore.getState().bgPreset).toBe("custom");
    expect(useCollageStore.getState().backgroundColor).toBe("#123456");
  });

  it("setAspectRatio updates aspect ratio", () => {
    useCollageStore.getState().setAspectRatio("16:9");
    expect(useCollageStore.getState().aspectRatio).toBe("16:9");
  });

  it("setOutputFormat updates output format", () => {
    useCollageStore.getState().setOutputFormat("webp");
    expect(useCollageStore.getState().outputFormat).toBe("webp");
  });

  it("setQuality updates quality", () => {
    useCollageStore.getState().setQuality(75);
    expect(useCollageStore.getState().quality).toBe(75);
  });

  it("setSelectedCell updates selected cell", () => {
    useCollageStore.getState().setSelectedCell(1);
    expect(useCollageStore.getState().selectedCell).toBe(1);
    useCollageStore.getState().setSelectedCell(null);
    expect(useCollageStore.getState().selectedCell).toBeNull();
  });

  it("setPhase updates phase", () => {
    useCollageStore.getState().setPhase("processing");
    expect(useCollageStore.getState().phase).toBe("processing");
  });

  it("setProgress updates progress", () => {
    useCollageStore.getState().setProgress(42);
    expect(useCollageStore.getState().progress).toBe(42);
  });

  it("setResult sets result fields and transitions to result phase", () => {
    useCollageStore.getState().setResult("blob:result", 5000, 10000, "job-123");
    const s = useCollageStore.getState();
    expect(s.resultUrl).toBe("blob:result");
    expect(s.resultSize).toBe(5000);
    expect(s.originalSize).toBe(10000);
    expect(s.jobId).toBe("job-123");
    expect(s.phase).toBe("result");
    expect(s.error).toBeNull();
  });

  it("setError sets error and returns to editing phase", () => {
    useCollageStore.getState().setPhase("processing");
    useCollageStore.getState().setError("Something went wrong");
    const s = useCollageStore.getState();
    expect(s.error).toBe("Something went wrong");
    expect(s.phase).toBe("editing");
  });

  it("reset revokes all blob URLs and restores initial state", () => {
    const file1 = new File(["a"], "a.png", { type: "image/png" });
    useCollageStore.getState().addImages([file1]);
    useCollageStore.getState().setGap(20);
    useCollageStore.getState().setCornerRadius(10);
    useCollageStore.getState().setOutputFormat("jpeg");
    revokeObjectURL.mockClear();

    useCollageStore.getState().reset();

    expect(revokeObjectURL).toHaveBeenCalled();
    const s = useCollageStore.getState();
    expect(s.images).toEqual([]);
    expect(s.gap).toBe(8);
    expect(s.cornerRadius).toBe(0);
    expect(s.outputFormat).toBe("png");
    expect(s.phase).toBe("upload");
  });
});

// ==========================================================================
// SettingsStore
// ==========================================================================

// Mock the api module to prevent real network calls
vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  formatHeaders: vi.fn(() => new Headers()),
}));

import { apiGet } from "@/lib/api";
import { useSettingsStore } from "@/stores/settings-store";

const mockApiGet = vi.mocked(apiGet);

describe("useSettingsStore", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      disabledTools: [],
      experimentalEnabled: false,
      defaultToolView: "sidebar",
      defaultTheme: "light",
      loaded: false,
      loadError: false,
    });
    localStorage.removeItem("snapotter-theme-user-set");
    mockApiGet.mockReset();
  });

  it("has correct initial state", () => {
    const s = useSettingsStore.getState();
    expect(s.disabledTools).toEqual([]);
    expect(s.experimentalEnabled).toBe(false);
    expect(s.defaultToolView).toBe("sidebar");
    expect(s.defaultTheme).toBe("light");
    expect(s.loaded).toBe(false);
  });

  it("fetch loads settings from API", async () => {
    mockApiGet.mockResolvedValueOnce({
      settings: {
        disabledTools: JSON.stringify(["resize", "crop"]),
        enableExperimentalTools: "true",
        defaultToolView: "fullscreen",
        defaultTheme: "dark",
      },
    });

    await useSettingsStore.getState().fetch();

    const s = useSettingsStore.getState();
    expect(s.disabledTools).toEqual(["resize", "crop"]);
    expect(s.experimentalEnabled).toBe(true);
    expect(s.defaultToolView).toBe("fullscreen");
    expect(s.defaultTheme).toBe("dark");
    expect(s.loaded).toBe(true);
  });

  it("fetch applies server default theme when no user preference", async () => {
    mockApiGet.mockResolvedValueOnce({
      settings: { defaultTheme: "dark" },
    });

    await useSettingsStore.getState().fetch();

    const theme = useThemeStore.getState();
    expect(theme.theme).toBe("dark");
    expect(theme.resolvedTheme).toBe("dark");
  });

  it("fetch does not override user theme preference", async () => {
    useThemeStore.getState().setTheme("light");

    mockApiGet.mockResolvedValueOnce({
      settings: { defaultTheme: "dark" },
    });

    await useSettingsStore.getState().fetch();

    const theme = useThemeStore.getState();
    expect(theme.theme).toBe("light");
  });

  it("fetch defaults defaultTheme to light for invalid values", async () => {
    mockApiGet.mockResolvedValueOnce({
      settings: { defaultTheme: "invalid" },
    });

    await useSettingsStore.getState().fetch();
    expect(useSettingsStore.getState().defaultTheme).toBe("light");
  });

  it("fetch skips when already loaded without error", async () => {
    useSettingsStore.setState({ loaded: true, loadError: false });
    await useSettingsStore.getState().fetch();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fetch handles empty disabledTools gracefully", async () => {
    mockApiGet.mockResolvedValueOnce({
      settings: {},
    });

    await useSettingsStore.getState().fetch();

    const s = useSettingsStore.getState();
    expect(s.disabledTools).toEqual([]);
    expect(s.experimentalEnabled).toBe(false);
    expect(s.defaultToolView).toBe("sidebar");
    expect(s.defaultTheme).toBe("light");
    expect(s.loaded).toBe(true);
  });

  it("fetch defaults defaultToolView to sidebar for unknown values", async () => {
    mockApiGet.mockResolvedValueOnce({
      settings: {
        defaultToolView: "unknown-value",
      },
    });

    await useSettingsStore.getState().fetch();
    expect(useSettingsStore.getState().defaultToolView).toBe("sidebar");
  });

  it("fetch sets loaded=true and loadError=true on error", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    await useSettingsStore.getState().fetch();

    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().loadError).toBe(true);
    expect(useSettingsStore.getState().disabledTools).toEqual([]);
  });

  it("fetch retries when loadError is true", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));
    await useSettingsStore.getState().fetch();
    expect(useSettingsStore.getState().loadError).toBe(true);

    mockApiGet.mockResolvedValueOnce({
      settings: { disabledTools: JSON.stringify(["resize"]) },
    });
    await useSettingsStore.getState().fetch();

    expect(useSettingsStore.getState().loadError).toBe(false);
    expect(useSettingsStore.getState().disabledTools).toEqual(["resize"]);
  });
});

// ==========================================================================
// FeaturesStore
// ==========================================================================

vi.mock("@snapotter/shared", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    TOOL_BUNDLE_MAP: {
      "remove-bg": "ai-rembg",
      upscale: "ai-esrgan",
    },
  };
});

import { apiPost } from "@/lib/api";
import { useFeaturesStore } from "@/stores/features-store";

const mockApiPost = vi.mocked(apiPost);

describe("useFeaturesStore", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    fetchMock.mockReset();
    useFeaturesStore.setState({
      bundles: [],
      loaded: false,
      loadError: false,
      installing: {},
      errors: {},
      queued: [],
      installAllActive: false,
      startTimes: {},
    });
  });

  it("has correct initial state", () => {
    const s = useFeaturesStore.getState();
    expect(s.bundles).toEqual([]);
    expect(s.loaded).toBe(false);
    expect(s.installing).toEqual({});
    expect(s.errors).toEqual({});
    expect(s.queued).toEqual([]);
    expect(s.installAllActive).toBe(false);
    expect(s.startTimes).toEqual({});
  });

  it("fetch loads bundles from API", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI Background Remover",
        description: "Remove backgrounds",
        status: "installed" as const,
        installedVersion: "1.0.0",
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
    ];
    mockApiGet.mockResolvedValueOnce({ bundles });

    await useFeaturesStore.getState().fetch();

    const s = useFeaturesStore.getState();
    expect(s.bundles).toEqual(bundles);
    expect(s.loaded).toBe(true);
  });

  it("fetch skips when already loaded without error", async () => {
    useFeaturesStore.setState({ loaded: true, loadError: false });
    await useFeaturesStore.getState().fetch();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("fetch sets loaded=true and loadError=true on error", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));
    await useFeaturesStore.getState().fetch();
    expect(useFeaturesStore.getState().loaded).toBe(true);
    expect(useFeaturesStore.getState().loadError).toBe(true);
    expect(useFeaturesStore.getState().bundles).toEqual([]);
  });

  it("fetch retries when loadError is true", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));
    await useFeaturesStore.getState().fetch();
    expect(useFeaturesStore.getState().loadError).toBe(true);

    const bundles = [
      {
        id: "ai-rembg",
        name: "AI Background Remover",
        description: "Remove backgrounds",
        status: "installed" as const,
        installedVersion: "1.0.0",
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
    ];
    mockApiGet.mockResolvedValueOnce({ bundles });
    await useFeaturesStore.getState().fetch();

    expect(useFeaturesStore.getState().loadError).toBe(false);
    expect(useFeaturesStore.getState().bundles).toEqual(bundles);
  });

  it("isToolInstalled returns true for tools whose bundle is installed", () => {
    useFeaturesStore.setState({
      bundles: [
        {
          id: "ai-rembg",
          name: "AI Background Remover",
          description: "Remove backgrounds",
          status: "installed",
          installedVersion: "1.0.0",
          estimatedSize: "500MB",
          enablesTools: ["remove-bg"],
          progress: null,
          error: null,
        },
      ],
    });
    expect(useFeaturesStore.getState().isToolInstalled("remove-bg")).toBe(true);
  });

  it("isToolInstalled returns false for tools whose bundle is not installed", () => {
    useFeaturesStore.setState({
      bundles: [
        {
          id: "ai-rembg",
          name: "AI Background Remover",
          description: "Remove backgrounds",
          status: "not_installed",
          installedVersion: null,
          estimatedSize: "500MB",
          enablesTools: ["remove-bg"],
          progress: null,
          error: null,
        },
      ],
    });
    expect(useFeaturesStore.getState().isToolInstalled("remove-bg")).toBe(false);
  });

  it("isToolInstalled returns true for tools without a bundle mapping", () => {
    expect(useFeaturesStore.getState().isToolInstalled("resize")).toBe(true);
  });

  it("getBundleForTool returns the bundle for a mapped tool", () => {
    const bundle = {
      id: "ai-rembg",
      name: "AI Background Remover",
      description: "Remove backgrounds",
      status: "installed" as const,
      installedVersion: "1.0.0",
      estimatedSize: "500MB",
      enablesTools: ["remove-bg"],
      progress: null,
      error: null,
    };
    useFeaturesStore.setState({ bundles: [bundle] });
    expect(useFeaturesStore.getState().getBundleForTool("remove-bg")).toEqual(bundle);
  });

  it("getBundleForTool returns null for unmapped tools", () => {
    expect(useFeaturesStore.getState().getBundleForTool("resize")).toBeNull();
  });

  it("clearError removes a specific bundle error", () => {
    useFeaturesStore.setState({
      errors: { "ai-rembg": "Failed", "ai-esrgan": "Also failed" },
    });
    useFeaturesStore.getState().clearError("ai-rembg");
    expect(useFeaturesStore.getState().errors).toEqual({ "ai-esrgan": "Also failed" });
  });

  it("uninstallBundle calls API and refreshes bundles", async () => {
    mockApiPost.mockResolvedValueOnce({});
    mockApiGet.mockResolvedValueOnce({ bundles: [] });

    await useFeaturesStore.getState().uninstallBundle("ai-rembg");

    expect(mockApiPost).toHaveBeenCalledWith("/v1/admin/features/ai-rembg/uninstall", {});
  });

  it("uninstallBundle sets error on failure", async () => {
    mockApiPost.mockRejectedValueOnce(new Error("Uninstall failed"));

    await useFeaturesStore.getState().uninstallBundle("ai-rembg");

    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBe("Uninstall failed");
  });

  it("installBundle sets initial progress and calls API", async () => {
    // Mock EventSource globally
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockReturnValue({
        onmessage: null,
        onerror: null,
        close: mockClose,
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-123" });

    await useFeaturesStore.getState().installBundle("ai-rembg");

    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeDefined();
    expect(useFeaturesStore.getState().installing["ai-rembg"].percent).toBeGreaterThanOrEqual(5);
    expect(useFeaturesStore.getState().startTimes["ai-rembg"]).toBeDefined();
  });

  it("installBundle sets error on API failure", async () => {
    mockApiPost.mockRejectedValueOnce(new Error("Server error"));

    await useFeaturesStore.getState().installBundle("ai-rembg");

    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBe("Server error");
    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeUndefined();
  });

  it("installBundle sets generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValueOnce("string error");

    await useFeaturesStore.getState().installBundle("ai-rembg");

    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBe("Failed to start installation");
  });

  it("installBundle clears previous error for that bundle", async () => {
    useFeaturesStore.setState({
      errors: { "ai-rembg": "Old error" },
    });

    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockReturnValue({
        onmessage: null,
        onerror: null,
        close: mockClose,
      }),
    );
    mockApiPost.mockResolvedValueOnce({ jobId: "job-456" });

    await useFeaturesStore.getState().installBundle("ai-rembg");

    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBeUndefined();
  });

  it("uninstallBundle sets generic error for non-Error throws", async () => {
    mockApiPost.mockRejectedValueOnce(42);

    await useFeaturesStore.getState().uninstallBundle("ai-rembg");

    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBe("Uninstall failed");
  });

  it("getBundleForTool returns null when bundle not found in bundles list", () => {
    useFeaturesStore.setState({ bundles: [] });
    expect(useFeaturesStore.getState().getBundleForTool("remove-bg")).toBeNull();
  });

  it("isToolInstalled returns false when bundle exists but is in error state", () => {
    useFeaturesStore.setState({
      bundles: [
        {
          id: "ai-rembg",
          name: "AI Background Remover",
          description: "Remove backgrounds",
          status: "error",
          installedVersion: null,
          estimatedSize: "500MB",
          enablesTools: ["remove-bg"],
          progress: null,
          error: "Install failed",
        },
      ],
    });
    expect(useFeaturesStore.getState().isToolInstalled("remove-bg")).toBe(false);
  });

  it("isToolInstalled returns false when bundle is installing", () => {
    useFeaturesStore.setState({
      bundles: [
        {
          id: "ai-rembg",
          name: "AI Background Remover",
          description: "Remove backgrounds",
          status: "installing",
          installedVersion: null,
          estimatedSize: "500MB",
          enablesTools: ["remove-bg"],
          progress: { percent: 50, stage: "Downloading..." },
          error: null,
        },
      ],
    });
    expect(useFeaturesStore.getState().isToolInstalled("remove-bg")).toBe(false);
  });

  it("clearError is a no-op for nonexistent bundle", () => {
    useFeaturesStore.setState({ errors: { "ai-rembg": "Error" } });
    useFeaturesStore.getState().clearError("nonexistent");
    expect(useFeaturesStore.getState().errors).toEqual({ "ai-rembg": "Error" });
  });

  it("refresh updates bundles from API", async () => {
    const bundles = [
      {
        id: "ai-esrgan",
        name: "AI Upscaler",
        description: "Upscale images",
        status: "installed" as const,
        installedVersion: "2.0.0",
        estimatedSize: "1GB",
        enablesTools: ["upscale"],
        progress: null,
        error: null,
      },
    ];
    mockApiGet.mockResolvedValueOnce({ bundles });

    await useFeaturesStore.getState().refresh();

    expect(useFeaturesStore.getState().bundles).toEqual(bundles);
    expect(useFeaturesStore.getState().loaded).toBe(true);
  });

  it("refresh silently ignores API errors", async () => {
    useFeaturesStore.setState({
      bundles: [
        {
          id: "ai-rembg",
          name: "AI Background Remover",
          description: "Remove backgrounds",
          status: "installed",
          installedVersion: "1.0.0",
          estimatedSize: "500MB",
          enablesTools: ["remove-bg"],
          progress: null,
          error: null,
        },
      ],
      loaded: true,
    });
    mockApiGet.mockRejectedValueOnce(new Error("Network error"));

    await useFeaturesStore.getState().refresh();

    // Bundles should remain unchanged on error
    expect(useFeaturesStore.getState().bundles).toHaveLength(1);
  });

  it("fetch recovers active installs on load", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI Background Remover",
        description: "Remove backgrounds",
        status: "installing" as const,
        installedVersion: null,
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: { percent: 30, stage: "Downloading models..." },
        error: null,
      },
    ];
    mockApiGet.mockResolvedValueOnce({ bundles });

    await useFeaturesStore.getState().fetch();

    // The recovering logic should have set installing state for the active bundle
    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeDefined();
    expect(useFeaturesStore.getState().installing["ai-rembg"].percent).toBe(30);
    expect(useFeaturesStore.getState().installing["ai-rembg"].stage).toBe("Downloading models...");
  });

  it("fetch recovers active installs with default progress when none given", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI Background Remover",
        description: "Remove backgrounds",
        status: "installing" as const,
        installedVersion: null,
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
    ];
    mockApiGet.mockResolvedValueOnce({ bundles });

    await useFeaturesStore.getState().fetch();

    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeDefined();
    expect(useFeaturesStore.getState().installing["ai-rembg"].percent).toBe(0);
    expect(useFeaturesStore.getState().installing["ai-rembg"].stage).toBe("Resuming...");
  });

  it("reinstallBundle calls uninstall then install", async () => {
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockReturnValue({
        onmessage: null,
        onerror: null,
        close: mockClose,
      }),
    );

    // uninstall call
    mockApiPost.mockResolvedValueOnce({});
    // refresh after uninstall
    mockApiGet.mockResolvedValueOnce({ bundles: [] });
    // install call
    mockApiPost.mockResolvedValueOnce({ jobId: "job-reinstall" });

    await useFeaturesStore.getState().reinstallBundle("ai-rembg");

    expect(mockApiPost).toHaveBeenCalledWith("/v1/admin/features/ai-rembg/uninstall", {});
    expect(mockApiPost).toHaveBeenCalledWith("/v1/admin/features/ai-rembg/install", {});
  });

  // -- EventSource progress handling ----------------------------------------

  it("listenToProgress handles complete phase from EventSource", async () => {
    let esOnMessage: ((event: MessageEvent) => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        // Capture for later triggering
        setTimeout(() => {
          esOnMessage = es.onmessage;
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-complete" });
    // refresh after complete
    mockApiGet.mockResolvedValueOnce({ bundles: [] });

    await useFeaturesStore.getState().installBundle("ai-rembg");
    // Wait for setTimeout to capture the onmessage handler
    await new Promise((r) => setTimeout(r, 10));

    // Simulate complete event
    if (esOnMessage) {
      esOnMessage({
        data: JSON.stringify({ phase: "complete", percent: 100, stage: "Done" }),
      } as MessageEvent);
    }
    expect(mockClose).toHaveBeenCalled();
    // Installing should be cleared
    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeUndefined();
  });

  it("listenToProgress handles failed phase from EventSource", async () => {
    let esOnMessage: ((event: MessageEvent) => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        setTimeout(() => {
          esOnMessage = es.onmessage;
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-fail" });

    await useFeaturesStore.getState().installBundle("ai-rembg");
    await new Promise((r) => setTimeout(r, 10));

    // Simulate failed event
    if (esOnMessage) {
      esOnMessage({
        data: JSON.stringify({ phase: "failed", percent: 0, stage: "", error: "Disk full" }),
      } as MessageEvent);
    }
    expect(mockClose).toHaveBeenCalled();
    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBe("Disk full");
    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeUndefined();
  });

  it("listenToProgress handles progress updates from EventSource", async () => {
    let esOnMessage: ((event: MessageEvent) => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        setTimeout(() => {
          esOnMessage = es.onmessage;
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-progress" });

    await useFeaturesStore.getState().installBundle("ai-rembg");
    await new Promise((r) => setTimeout(r, 10));

    // Simulate progress update
    if (esOnMessage) {
      esOnMessage({
        data: JSON.stringify({ phase: "processing", percent: 50, stage: "Downloading..." }),
      } as MessageEvent);
    }
    expect(useFeaturesStore.getState().installing["ai-rembg"].percent).toBe(50);
    expect(useFeaturesStore.getState().installing["ai-rembg"].stage).toBe("Downloading...");
  });

  it("listenToProgress uses max of current and new percent", async () => {
    let esOnMessage: ((event: MessageEvent) => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        setTimeout(() => {
          esOnMessage = es.onmessage;
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-max" });

    await useFeaturesStore.getState().installBundle("ai-rembg");
    await new Promise((r) => setTimeout(r, 10));

    // Send a high percent first
    if (esOnMessage) {
      esOnMessage({
        data: JSON.stringify({ phase: "processing", percent: 70, stage: "Step 1" }),
      } as MessageEvent);
    }
    // Then a lower percent (should keep the higher one)
    if (esOnMessage) {
      esOnMessage({
        data: JSON.stringify({ phase: "processing", percent: 40, stage: "Step 2" }),
      } as MessageEvent);
    }
    expect(useFeaturesStore.getState().installing["ai-rembg"].percent).toBe(70);
    expect(useFeaturesStore.getState().installing["ai-rembg"].stage).toBe("Step 2");
  });

  it("EventSource onerror closes and falls back to polling", async () => {
    let esOnError: (() => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        setTimeout(() => {
          esOnError = es.onerror;
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-err" });

    await useFeaturesStore.getState().installBundle("ai-rembg");
    await new Promise((r) => setTimeout(r, 10));

    // Trigger onerror
    if (esOnError) {
      esOnError();
    }
    expect(mockClose).toHaveBeenCalled();
    // Bundle should still be in installing state (polling takes over)
    expect(useFeaturesStore.getState().installing["ai-rembg"]).toBeDefined();
  });

  // -- installAll -----------------------------------------------------------

  it("installAll processes all not-installed bundles sequentially", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI Background Remover",
        description: "Remove backgrounds",
        status: "not_installed" as const,
        installedVersion: null,
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
      {
        id: "ai-esrgan",
        name: "AI Upscaler",
        description: "Upscale images",
        status: "installed" as const,
        installedVersion: "1.0",
        estimatedSize: "1GB",
        enablesTools: ["upscale"],
        progress: null,
        error: null,
      },
    ];
    useFeaturesStore.setState({ bundles, loaded: true });

    // For the install call, we need to immediately resolve so installAll loop progresses
    let esOnMessage: ((event: MessageEvent) => void) | null = null;
    const mockClose = vi.fn();
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: mockClose,
        };
        setTimeout(() => {
          esOnMessage = es.onmessage;
          // Immediately complete the install
          if (esOnMessage) {
            esOnMessage({
              data: JSON.stringify({ phase: "complete", percent: 100, stage: "Done" }),
            } as MessageEvent);
          }
        }, 0);
        return es;
      }),
    );

    // install call for ai-rembg
    mockApiPost.mockResolvedValueOnce({ jobId: "job-all-1" });
    // refresh after completion
    mockApiGet.mockResolvedValue({ bundles });

    await useFeaturesStore.getState().installAll();

    expect(useFeaturesStore.getState().installAllActive).toBe(false);
    expect(useFeaturesStore.getState().queued).toEqual([]);
    // Only not-installed bundle should have been installed
    expect(mockApiPost).toHaveBeenCalledWith("/v1/admin/features/ai-rembg/install", {});
  });

  it("installAll skips bundles that are already installed", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI BG",
        description: "Remove backgrounds",
        status: "installed" as const,
        installedVersion: "1.0",
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
    ];
    useFeaturesStore.setState({ bundles, loaded: true });

    await useFeaturesStore.getState().installAll();

    expect(useFeaturesStore.getState().installAllActive).toBe(false);
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("installAll clears stale errors for pending bundles", async () => {
    const bundles = [
      {
        id: "ai-rembg",
        name: "AI BG",
        description: "Remove backgrounds",
        status: "not_installed" as const,
        installedVersion: null,
        estimatedSize: "500MB",
        enablesTools: ["remove-bg"],
        progress: null,
        error: null,
      },
    ];
    useFeaturesStore.setState({
      bundles,
      loaded: true,
      errors: { "ai-rembg": "Previous error" },
    });

    // Setup fast-completing EventSource
    vi.stubGlobal(
      "EventSource",
      vi.fn().mockImplementation(() => {
        const es = {
          onmessage: null as ((event: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          close: vi.fn(),
        };
        setTimeout(() => {
          if (es.onmessage) {
            es.onmessage({
              data: JSON.stringify({ phase: "complete", percent: 100, stage: "Done" }),
            } as MessageEvent);
          }
        }, 0);
        return es;
      }),
    );

    mockApiPost.mockResolvedValueOnce({ jobId: "job-clear" });
    mockApiGet.mockResolvedValue({ bundles });

    await useFeaturesStore.getState().installAll();

    // Error should have been cleared at the start of installAll
    expect(useFeaturesStore.getState().errors["ai-rembg"]).toBeUndefined();
  });
});

// ==========================================================================
// AnalyticsStore
// ==========================================================================

// Mock the analytics lib to avoid importing Sentry/PostHog
vi.mock("@/lib/analytics", () => ({
  setAnalyticsConsent: vi.fn(),
  initAnalytics: vi.fn(),
  identify: vi.fn(),
  trackEvent: vi.fn(),
  trackPageView: vi.fn(),
}));

import { setAnalyticsConsent } from "@/lib/analytics";
import { apiPut } from "@/lib/api";
import { useAnalyticsStore } from "@/stores/analytics-store";

const mockApiPut = vi.mocked(apiPut);
const mockSetAnalyticsConsent = vi.mocked(setAnalyticsConsent);

describe("useAnalyticsStore", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockApiPut.mockReset();
    mockSetAnalyticsConsent.mockClear();
    storageMap.clear();
    useAnalyticsStore.setState({
      config: null,
      consent: {
        analyticsEnabled: null,
        analyticsConsentShownAt: null,
        analyticsConsentRemindAt: null,
      },
      configLoaded: false,
    });
  });

  it("has correct initial state", () => {
    const s = useAnalyticsStore.getState();
    expect(s.config).toBeNull();
    expect(s.consent.analyticsEnabled).toBeNull();
    expect(s.consent.analyticsConsentShownAt).toBeNull();
    expect(s.consent.analyticsConsentRemindAt).toBeNull();
    expect(s.configLoaded).toBe(false);
  });

  it("fetchConfig loads config from API", async () => {
    const config = {
      enabled: true,
      posthogApiKey: "phc_test",
      posthogHost: "https://ph.example.com",
      sentryDsn: "https://sentry.example.com",
      sampleRate: 0.5,
      instanceId: "inst-123",
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(config),
    });

    await useAnalyticsStore.getState().fetchConfig();

    const s = useAnalyticsStore.getState();
    expect(s.config).toEqual(config);
    expect(s.configLoaded).toBe(true);
  });

  it("fetchConfig skips when already loaded", async () => {
    useAnalyticsStore.setState({ configLoaded: true });
    await useAnalyticsStore.getState().fetchConfig();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchConfig sets configLoaded=true on error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    await useAnalyticsStore.getState().fetchConfig();
    expect(useAnalyticsStore.getState().configLoaded).toBe(true);
    expect(useAnalyticsStore.getState().config).toBeNull();
  });

  it("setConsent updates consent and calls setAnalyticsConsent", () => {
    const consent = {
      analyticsEnabled: true,
      analyticsConsentShownAt: 1000,
      analyticsConsentRemindAt: null,
    };
    useAnalyticsStore.getState().setConsent(consent);

    expect(useAnalyticsStore.getState().consent).toEqual(consent);
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(true);
  });

  it("acceptAnalytics calls API and sets consent to true", async () => {
    mockApiPut.mockResolvedValueOnce({});

    await useAnalyticsStore.getState().acceptAnalytics();

    const s = useAnalyticsStore.getState();
    expect(s.consent.analyticsEnabled).toBe(true);
    expect(s.consent.analyticsConsentShownAt).toBeTypeOf("number");
    expect(s.consent.analyticsConsentRemindAt).toBeNull();
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(true);
  });

  it("acceptAnalytics falls back to localStorage on API error", async () => {
    mockApiPut.mockRejectedValueOnce(new Error("Server error"));

    await useAnalyticsStore.getState().acceptAnalytics();

    expect(localStorage.setItem).toHaveBeenCalledWith("snapotter-analytics-consent", "true");
    expect(useAnalyticsStore.getState().consent.analyticsEnabled).toBe(true);
  });

  it("declineAnalytics calls API and sets consent to false", async () => {
    mockApiPut.mockResolvedValueOnce({});

    await useAnalyticsStore.getState().declineAnalytics();

    const s = useAnalyticsStore.getState();
    expect(s.consent.analyticsEnabled).toBe(false);
    expect(s.consent.analyticsConsentShownAt).toBeTypeOf("number");
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(false);
  });

  it("declineAnalytics falls back to localStorage on API error", async () => {
    mockApiPut.mockRejectedValueOnce(new Error("Server error"));

    await useAnalyticsStore.getState().declineAnalytics();

    expect(localStorage.setItem).toHaveBeenCalledWith("snapotter-analytics-consent", "false");
  });

  it("remindLater calls API and sets remind-at 7 days in the future", async () => {
    mockApiPut.mockResolvedValueOnce({});

    const before = Date.now();
    await useAnalyticsStore.getState().remindLater();
    const after = Date.now();

    const s = useAnalyticsStore.getState();
    expect(s.consent.analyticsEnabled).toBeNull();
    expect(s.consent.analyticsConsentRemindAt).toBeTypeOf("number");
    // Remind-at should be approximately 7 days from now
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(s.consent.analyticsConsentRemindAt!).toBeGreaterThanOrEqual(before + sevenDays);
    expect(s.consent.analyticsConsentRemindAt!).toBeLessThanOrEqual(after + sevenDays);
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(false);
  });

  it("remindLater falls back to localStorage on API error", async () => {
    mockApiPut.mockRejectedValueOnce(new Error("Server error"));

    await useAnalyticsStore.getState().remindLater();

    expect(localStorage.setItem).toHaveBeenCalledWith("snapotter-analytics-consent", "remind");
  });

  it("toggleAnalytics enables analytics", async () => {
    mockApiPut.mockResolvedValueOnce({});

    await useAnalyticsStore.getState().toggleAnalytics(true);

    expect(useAnalyticsStore.getState().consent.analyticsEnabled).toBe(true);
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(true);
  });

  it("toggleAnalytics disables analytics", async () => {
    mockApiPut.mockResolvedValueOnce({});

    await useAnalyticsStore.getState().toggleAnalytics(false);

    expect(useAnalyticsStore.getState().consent.analyticsEnabled).toBe(false);
    expect(mockSetAnalyticsConsent).toHaveBeenCalledWith(false);
  });

  it("toggleAnalytics falls back to localStorage on API error", async () => {
    mockApiPut.mockRejectedValueOnce(new Error("Server error"));

    await useAnalyticsStore.getState().toggleAnalytics(true);

    expect(localStorage.setItem).toHaveBeenCalledWith("snapotter-analytics-consent", "true");
    expect(useAnalyticsStore.getState().consent.analyticsEnabled).toBe(true);
  });
});
