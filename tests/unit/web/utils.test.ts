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
    for (const leftover of document.body.querySelectorAll("textarea")) leftover.remove();
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

  // #1937: the fallback textarea holds the copied text (often an API key or
  // recovery codes), so it must leave the DOM on every path, throws included.
  const leftoverTextareas = () => document.body.querySelectorAll("textarea").length;

  it("copies the text through a temporary textarea and removes it afterwards", async () => {
    Object.assign(navigator, { clipboard: undefined });
    let seen: string | undefined;
    document.execCommand = vi.fn().mockImplementation(() => {
      seen = document.body.querySelector("textarea")?.value;
      return true;
    });
    expect(await copyToClipboard("si_secret")).toBe(true);
    expect(seen).toBe("si_secret");
    expect(leftoverTextareas()).toBe(0);
  });

  it("removes the textarea when execCommand returns false", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(false);
    expect(await copyToClipboard("si_secret")).toBe(false);
    expect(leftoverTextareas()).toBe(0);
  });

  it("removes the textarea when execCommand throws", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error("not supported");
    });
    expect(await copyToClipboard("si_secret")).toBe(false);
    expect(leftoverTextareas()).toBe(0);
  });

  it("removes the textarea when select() throws", async () => {
    Object.assign(navigator, { clipboard: undefined });
    document.execCommand = vi.fn().mockReturnValue(true);
    vi.spyOn(HTMLTextAreaElement.prototype, "select").mockImplementation(() => {
      throw new Error("select blocked");
    });
    expect(await copyToClipboard("si_secret")).toBe(false);
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(leftoverTextareas()).toBe(0);
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
