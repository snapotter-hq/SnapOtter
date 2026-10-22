// @vitest-environment jsdom
/**
 * Expanded store tests covering uncovered branches:
 * - QR store: gradient settings, corner colors, custom dot types
 * - Split store: edge cases for effective grid, computed dimensions
 * - Pipeline store: reorder edge cases
 * - PDF store: compressPageRange edge cases
 * - Duplicate store: view mode transitions
 * - Base64 store: concurrent adds
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    persist: (config: unknown) => config,
  };
});

const revokeObjectURL = vi.fn();
const createObjectURL = vi.fn((_obj: Blob | MediaSource) => "blob:fake-url");

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL,
  revokeObjectURL,
});

vi.stubGlobal("fetch", vi.fn());

vi.stubGlobal("localStorage", {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() {
    return 0;
  },
  key: vi.fn((_i: number) => null),
});

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }),
);

vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  formatHeaders: vi.fn(() => new Headers()),
}));

vi.mock("@/lib/collage-templates", () => ({
  COLLAGE_TEMPLATES: [
    {
      id: "2-h-equal",
      imageCount: 2,
      cells: [
        { gridColumn: "1", gridRow: "1" },
        { gridColumn: "2", gridRow: "1" },
      ],
    },
  ],
  getDefaultTemplate: () => ({
    id: "2-h-equal",
    imageCount: 2,
    cells: [
      { gridColumn: "1", gridRow: "1" },
      { gridColumn: "2", gridRow: "1" },
    ],
  }),
}));

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

// ---------------------------------------------------------------------------
// QR Store expanded
// ---------------------------------------------------------------------------
import { encodeQrData, useQrStore } from "@/stores/qr-store";

describe("useQrStore expanded", () => {
  beforeEach(() => {
    useQrStore.getState().reset();
  });

  it("setDotGradientEnabled toggles gradient", () => {
    useQrStore.getState().setDotGradientEnabled(true);
    expect(useQrStore.getState().dotGradientEnabled).toBe(true);
  });

  it("setDotGradientType changes gradient type", () => {
    useQrStore.getState().setDotGradientType("radial");
    expect(useQrStore.getState().dotGradientType).toBe("radial");
  });

  it("setDotGradientColor1 updates first gradient color", () => {
    useQrStore.getState().setDotGradientColor1("#FF0000");
    expect(useQrStore.getState().dotGradientColor1).toBe("#FF0000");
  });

  it("setDotGradientColor2 updates second gradient color", () => {
    useQrStore.getState().setDotGradientColor2("#0000FF");
    expect(useQrStore.getState().dotGradientColor2).toBe("#0000FF");
  });

  it("setDotGradientRotation updates rotation", () => {
    useQrStore.getState().setDotGradientRotation(45);
    expect(useQrStore.getState().dotGradientRotation).toBe(45);
  });

  it("setCornerSquareColor updates corner square color", () => {
    useQrStore.getState().setCornerSquareColor("#00FF00");
    expect(useQrStore.getState().cornerSquareColor).toBe("#00FF00");
  });

  it("setCornerDotColor updates corner dot color", () => {
    useQrStore.getState().setCornerDotColor("#FFFF00");
    expect(useQrStore.getState().cornerDotColor).toBe("#FFFF00");
  });

  it("setUseCustomCornerColors toggles custom corner colors", () => {
    useQrStore.getState().setUseCustomCornerColors(true);
    expect(useQrStore.getState().useCustomCornerColors).toBe(true);
  });

  it("setDotType changes dot type", () => {
    useQrStore.getState().setDotType("dots");
    expect(useQrStore.getState().dotType).toBe("dots");
  });

  it("setCornerSquareType changes corner square type", () => {
    useQrStore.getState().setCornerSquareType("dot");
    expect(useQrStore.getState().cornerSquareType).toBe("dot");
  });

  it("setCornerDotType changes corner dot type", () => {
    useQrStore.getState().setCornerDotType("square");
    expect(useQrStore.getState().cornerDotType).toBe("square");
  });

  it("setLogoSize updates logo size", () => {
    useQrStore.getState().setLogoSize(0.3);
    expect(useQrStore.getState().logoSize).toBe(0.3);
  });

  it("setLogoMargin updates logo margin", () => {
    useQrStore.getState().setLogoMargin(10);
    expect(useQrStore.getState().logoMargin).toBe(10);
  });

  it("setHideBackgroundDots toggles background dots visibility", () => {
    useQrStore.getState().setHideBackgroundDots(false);
    expect(useQrStore.getState().hideBackgroundDots).toBe(false);
  });

  it("setPhoneData updates phone data", () => {
    useQrStore.getState().setPhoneData("+15551234567");
    expect(useQrStore.getState().phoneData).toBe("+15551234567");
  });

  it("setBgColor updates background color", () => {
    useQrStore.getState().setBgColor("#CCCCCC");
    expect(useQrStore.getState().bgColor).toBe("#CCCCCC");
  });
});

describe("encodeQrData expanded", () => {
  it("encodes wifi with WEP encryption", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "wifi" as const,
      wifiData: { ssid: "Net", password: "key", encryption: "WEP" as const, hidden: true },
    };
    const result = encodeQrData(state);
    expect(result).toBe("WIFI:T:WEP;S:Net;P:key;H:true;;");
  });

  it("encodes wifi with no password (nopass)", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "wifi" as const,
      wifiData: { ssid: "Open", password: "", encryption: "nopass" as const, hidden: false },
    };
    expect(encodeQrData(state)).toBe("WIFI:T:nopass;S:Open;P:;H:false;;");
  });

  it("encodes email with only subject (no body)", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "email" as const,
      emailData: { to: "a@b.com", subject: "Test", body: "" },
    };
    expect(encodeQrData(state)).toBe("mailto:a@b.com?subject=Test");
  });

  it("encodes email with only body (no subject)", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "email" as const,
      emailData: { to: "a@b.com", subject: "", body: "Hello" },
    };
    expect(encodeQrData(state)).toBe("mailto:a@b.com?body=Hello");
  });

  it("encodes vcard with only first name", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "vcard" as const,
      vcardData: {
        firstName: "Alice",
        lastName: "",
        phone: "",
        email: "",
        organization: "",
        title: "",
        url: "",
      },
    };
    const result = encodeQrData(state);
    expect(result).toContain("N:;Alice");
    expect(result).toContain("FN:Alice");
    expect(result).not.toContain("TEL:");
  });

  it("encodes sms with empty message", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "sms" as const,
      smsData: { phone: "+1234", message: "" },
    };
    expect(encodeQrData(state)).toBe("smsto:+1234:");
  });

  it("encodes empty text data", () => {
    const state = {
      ...useQrStore.getState(),
      contentType: "text" as const,
      textData: "",
    };
    expect(encodeQrData(state)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Split Store expanded
// ---------------------------------------------------------------------------
import { beginSplitRun, useSplitStore } from "@/stores/split-store";

describe("useSplitStore expanded", () => {
  beforeEach(() => {
    useSplitStore.getState().reset();
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
      runFileCount: 0,
      zipBlobUrl: null,
    });
  });

  it("setOutputFormat updates format", () => {
    useSplitStore.getState().setOutputFormat("webp");
    expect(useSplitStore.getState().outputFormat).toBe("webp");
  });

  it("setQuality updates quality", () => {
    useSplitStore.getState().setQuality(50);
    expect(useSplitStore.getState().quality).toBe(50);
  });

  it("setProcessing updates processing flag", () => {
    useSplitStore.getState().setProcessing(true);
    expect(useSplitStore.getState().processing).toBe(true);
  });

  it("setError updates error", () => {
    useSplitStore.getState().setError("Something broke");
    expect(useSplitStore.getState().error).toBe("Something broke");
  });

  it("setImageDimensions updates dimensions", () => {
    useSplitStore.getState().setImageDimensions({ width: 1920, height: 1080 });
    expect(useSplitStore.getState().imageDimensions).toEqual({ width: 1920, height: 1080 });
  });

  it("setImageDimensions with null clears dimensions", () => {
    useSplitStore.getState().setImageDimensions({ width: 100, height: 100 });
    useSplitStore.getState().setImageDimensions(null);
    expect(useSplitStore.getState().imageDimensions).toBeNull();
  });

  it("getEffectiveGrid returns columns/rows in tile-size mode without image dimensions", () => {
    useSplitStore.getState().setMode("tile-size");
    // No image dimensions set, so should fall back to grid mode values
    const grid = useSplitStore.getState().getEffectiveGrid();
    expect(grid).toEqual({ columns: 3, rows: 3 });
  });

  it("getEffectiveGrid with tile-size computes ceil for non-exact divisions", () => {
    useSplitStore.getState().setMode("tile-size");
    useSplitStore.getState().setTileWidth(150);
    useSplitStore.getState().setTileHeight(200);
    useSplitStore.getState().setImageDimensions({ width: 400, height: 500 });
    const grid = useSplitStore.getState().getEffectiveGrid();
    // 400/150 = 2.67 -> ceil = 3, 500/200 = 2.5 -> ceil = 3
    expect(grid).toEqual({ columns: 3, rows: 3 });
  });

  it("getComputedTileDimensions in grid mode floors division", () => {
    useSplitStore.getState().setImageDimensions({ width: 1000, height: 700 });
    useSplitStore.getState().setColumns(3);
    useSplitStore.getState().setRows(3);
    const dims = useSplitStore.getState().getComputedTileDimensions();
    // 1000/3 = 333.33 -> floor = 333, 700/3 = 233.33 -> floor = 233
    expect(dims).toEqual({ width: 333, height: 233 });
  });

  it("setZipBlobUrl with null does not call revokeObjectURL when previous was null", () => {
    revokeObjectURL.mockClear();
    useSplitStore.getState().setZipBlobUrl(null);
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("setColumns clears tiles on update", () => {
    useSplitStore
      .getState()
      .setTiles([{ row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: null }]);
    useSplitStore.getState().setColumns(4);
    expect(useSplitStore.getState().tiles).toEqual([]);
  });

  it("setRows clears tiles on update", () => {
    useSplitStore
      .getState()
      .setTiles([{ row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: null }]);
    useSplitStore.getState().setRows(5);
    expect(useSplitStore.getState().tiles).toEqual([]);
  });

  it("setTileWidth clears tiles on update", () => {
    useSplitStore
      .getState()
      .setTiles([{ row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: null }]);
    useSplitStore.getState().setTileWidth(300);
    expect(useSplitStore.getState().tiles).toEqual([]);
  });

  it("setTileHeight clears tiles on update", () => {
    useSplitStore
      .getState()
      .setTiles([{ row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: null }]);
    useSplitStore.getState().setTileHeight(400);
    expect(useSplitStore.getState().tiles).toEqual([]);
  });

  it.each([
    ["setMode", () => useSplitStore.getState().setMode("tile-size")],
    ["setColumns", () => useSplitStore.getState().setColumns(4)],
    ["setRows", () => useSplitStore.getState().setRows(5)],
    ["setTileWidth", () => useSplitStore.getState().setTileWidth(300)],
    ["setTileHeight", () => useSplitStore.getState().setTileHeight(400)],
    ["setOutputFormat", () => useSplitStore.getState().setOutputFormat("webp")],
    ["setQuality", () => useSplitStore.getState().setQuality(75)],
    ["applyPreset", () => useSplitStore.getState().applyPreset(2, 2)],
  ])(
    "%s revokes previous tile and zip blob URLs, resets runFileCount, and cancels in-flight runs (#3184, #3492)",
    (_name, act) => {
      const abort = vi.fn();
      const run = beginSplitRun(abort);
      useSplitStore.setState({
        processing: true,
        tiles: [
          { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:tile-1" },
          { row: 0, col: 1, label: "2", width: 100, height: 100, blobUrl: "blob:tile-2" },
          { row: 1, col: 0, label: "3", width: 100, height: 100, blobUrl: null },
        ],
        runFileCount: 2,
        zipBlobUrl: "blob:zip-1",
      });
      revokeObjectURL.mockClear();

      act();

      expect(abort).toHaveBeenCalledTimes(1);
      expect(run.isCurrent()).toBe(false);
      expect(useSplitStore.getState().processing).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:zip-1");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:tile-1");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:tile-2");
      expect(revokeObjectURL).toHaveBeenCalledTimes(3);
      expect(useSplitStore.getState().tiles).toEqual([]);
      expect(useSplitStore.getState().zipBlobUrl).toBeNull();
      expect(useSplitStore.getState().runFileCount).toBe(0);

      // Calling a second mutator after the active run was already canceled does not re-invoke abort
      abort.mockClear();
      useSplitStore.getState().setColumns(2);
      expect(abort).not.toHaveBeenCalled();
    },
  );

  it("setTiles revokes removed tile blob URLs without revoking retained tiles or zipBlobUrl", () => {
    useSplitStore.setState({
      tiles: [
        { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:keep" },
        { row: 0, col: 1, label: "2", width: 100, height: 100, blobUrl: "blob:drop" },
        { row: 0, col: 2, label: "3", width: 100, height: 100, blobUrl: "blob:drop" },
        { row: 1, col: 0, label: "4", width: 100, height: 100, blobUrl: null },
      ],
      runFileCount: 1,
      zipBlobUrl: "blob:active-zip",
    });
    revokeObjectURL.mockClear();

    useSplitStore.getState().setTiles(
      [
        { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:keep" },
        { row: 0, col: 1, label: "2", width: 100, height: 100, blobUrl: null },
      ],
      3,
    );

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:drop");
    expect(useSplitStore.getState().zipBlobUrl).toBe("blob:active-zip");
    expect(useSplitStore.getState().runFileCount).toBe(3);

    revokeObjectURL.mockClear();
    useSplitStore.getState().setZipBlobUrl("blob:active-zip");
    expect(revokeObjectURL).not.toHaveBeenCalled();

    useSplitStore.getState().setTiles([], 3);

    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:keep");
    expect(useSplitStore.getState().tiles).toEqual([]);
    expect(useSplitStore.getState().runFileCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pipeline Store expanded
// ---------------------------------------------------------------------------
import { usePipelineStore } from "@/stores/pipeline-store";

describe("usePipelineStore expanded", () => {
  beforeEach(() => {
    usePipelineStore.getState().reset();
  });

  it("reorderSteps with same ID is effectively a no-op", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().reorderSteps(id, id);
    // Step should still be there
    expect(usePipelineStore.getState().steps).toHaveLength(1);
    expect(usePipelineStore.getState().steps[0].id).toBe(id);
  });

  it("reorderSteps with one invalid ID is a no-op", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    const realId = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().reorderSteps(realId, "nonexistent");
    // Order unchanged
    expect(usePipelineStore.getState().steps[0].toolId).toBe("resize");
  });

  it("updateStepSettings for nonexistent ID does not crash", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().updateStepSettings("nonexistent", { foo: "bar" });
    // Step should be unchanged
    expect(usePipelineStore.getState().steps[0].settings).toEqual({});
  });

  it("removeStep with nonexistent ID is a no-op", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().removeStep("nonexistent");
    expect(usePipelineStore.getState().steps).toHaveLength(1);
  });

  it("loadSteps with empty array clears all steps", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    usePipelineStore.getState().loadSteps([]);
    expect(usePipelineStore.getState().steps).toEqual([]);
    expect(usePipelineStore.getState().expandedStepId).toBeNull();
  });

  it("loadSteps creates deep copies of settings", () => {
    const originalSettings = { quality: 80 };
    usePipelineStore.getState().loadSteps([{ toolId: "compress", settings: originalSettings }]);
    // Modifying original should not affect store
    originalSettings.quality = 50;
    expect(usePipelineStore.getState().steps[0].settings).toEqual({ quality: 80 });
  });
});

// ---------------------------------------------------------------------------
// Duplicate Store expanded
// ---------------------------------------------------------------------------
import { useDuplicateStore } from "@/stores/duplicate-store";

describe("useDuplicateStore expanded", () => {
  beforeEach(() => {
    useDuplicateStore.getState().reset();
  });

  it("overrideBest then reset clears all overrides", () => {
    useDuplicateStore.getState().overrideBest(0, 2);
    useDuplicateStore.getState().overrideBest(1, 3);
    useDuplicateStore.getState().reset();
    expect(useDuplicateStore.getState().bestOverrides).toEqual({});
  });

  it("setViewMode to overview preserves selectedGroupIndex", () => {
    useDuplicateStore.getState().setSelectedGroup(5);
    useDuplicateStore.getState().setViewMode("overview");
    expect(useDuplicateStore.getState().viewMode).toBe("overview");
    expect(useDuplicateStore.getState().selectedGroupIndex).toBe(5);
  });

  it("setScanning to false preserves other state", () => {
    useDuplicateStore.getState().setScanning(true);
    useDuplicateStore.getState().setViewMode("detail");
    useDuplicateStore.getState().setScanning(false);
    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().viewMode).toBe("detail");
  });
});

// ---------------------------------------------------------------------------
// Base64 Store expanded
// ---------------------------------------------------------------------------
import type { Base64Result } from "@/stores/base64-store";
import { useBase64Store } from "@/stores/base64-store";

describe("useBase64Store expanded", () => {
  beforeEach(() => {
    useBase64Store.getState().reset();
  });

  it("addResult followed by addError does not clear results", () => {
    const r: Base64Result = {
      filename: "ok.png",
      mimeType: "image/png",
      width: 10,
      height: 10,
      originalSize: 100,
      encodedSize: 133,
      overheadPercent: 33,
      base64: "x",
      dataUri: "data:image/png;base64,x",
    };
    useBase64Store.getState().addResult(r);
    useBase64Store.getState().addError({ filename: "bad.png", error: "fail" });
    expect(useBase64Store.getState().results).toHaveLength(1);
    expect(useBase64Store.getState().errors).toHaveLength(1);
  });

  it("setResults replaces previous results entirely", () => {
    const r1: Base64Result = {
      filename: "a.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      originalSize: 10,
      encodedSize: 13,
      overheadPercent: 30,
      base64: "a",
      dataUri: "data:image/png;base64,a",
    };
    useBase64Store.getState().addResult(r1);
    useBase64Store.getState().addResult({ ...r1, filename: "b.png" });

    const newResults: Base64Result[] = [{ ...r1, filename: "c.png" }];
    useBase64Store.getState().setResults(newResults, []);
    expect(useBase64Store.getState().results).toHaveLength(1);
    expect(useBase64Store.getState().results[0].filename).toBe("c.png");
  });

  it("setProgress with valid progress then null clears progress", () => {
    useBase64Store.getState().setProgress({ completed: 1, total: 3, currentFile: "a.png" });
    expect(useBase64Store.getState().progress).not.toBeNull();
    useBase64Store.getState().setProgress(null);
    expect(useBase64Store.getState().progress).toBeNull();
  });
});
