// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyImageToClipboard, copyToClipboard, generateId } from "../../../apps/web/src/lib/utils";

describe("generateId", () => {
  it("returns a valid UUID v4 string", () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

describe("copyToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    document.execCommand = originalExecCommand;
    vi.restoreAllMocks();
  });

  it("returns true when clipboard API succeeds", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    expect(await copyToClipboard("hello")).toBe(true);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when clipboard API fails", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(true);
    expect(await copyToClipboard("hello")).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns false when both approaches fail", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error("not supported");
    });
    expect(await copyToClipboard("hello")).toBe(false);
  });
});

describe("copyImageToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = globalThis.ClipboardItem;

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    if (originalClipboardItem === undefined) {
      delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;
    } else {
      globalThis.ClipboardItem = originalClipboardItem;
    }
    vi.restoreAllMocks();
  });

  const blob = () => new Blob(["png-bytes"], { type: "image/png" });

  it("returns false without throwing when navigator.clipboard is missing (insecure context)", async () => {
    Object.assign(navigator, { clipboard: undefined });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {};

    await expect(copyImageToClipboard(blob())).resolves.toBe(false);
  });

  it("returns false without throwing when ClipboardItem is missing", async () => {
    Object.assign(navigator, { clipboard: { write: vi.fn() } });
    delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

    await expect(copyImageToClipboard(blob())).resolves.toBe(false);
  });

  it("writes the blob and returns true when the API is available", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {
      items: unknown;
      constructor(items: unknown) {
        this.items = items;
      }
    };

    await expect(copyImageToClipboard(blob())).resolves.toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("returns false when the write itself rejects", async () => {
    Object.assign(navigator, {
      clipboard: { write: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    (globalThis as { ClipboardItem?: unknown }).ClipboardItem = class {};

    await expect(copyImageToClipboard(blob())).resolves.toBe(false);
  });
});
