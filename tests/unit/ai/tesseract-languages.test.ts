import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));

import {
  clearTesseractLanguageInventoryCache,
  getInstalledTesseractLanguages,
  SUPPORTED_TESSERACT_TRAINEDDATA,
} from "../../../packages/ai/src/tesseract-languages.js";

function createMockChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = vi.fn(() => true);
  return child;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearTesseractLanguageInventoryCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("getInstalledTesseractLanguages", () => {
  it("keeps unsupported Korean traineddata out of the Fast OCR preflight inventory", () => {
    expect(SUPPORTED_TESSERACT_TRAINEDDATA).toEqual(["eng", "deu", "fra", "spa", "chi_sim", "jpn"]);
    expect(SUPPORTED_TESSERACT_TRAINEDDATA).not.toContain("Hangul");
    expect(SUPPORTED_TESSERACT_TRAINEDDATA).not.toContain("kor");
  });

  it("parses and caches an exact list-langs inventory per executable", async () => {
    const first = createMockChild();
    mockSpawn.mockReturnValueOnce(first);

    const firstPromise = getInstalledTesseractLanguages({
      executable: "/usr/local/bin/tesseract",
      timeoutMs: 5_000,
    });
    expect(mockSpawn).toHaveBeenCalledWith(
      "/usr/local/bin/tesseract",
      ["--list-langs"],
      expect.objectContaining({ shell: false, windowsHide: true }),
    );
    first.stdout.write(
      'List of available languages in "/usr/local/share/tessdata/" (4):\neng\nHangul\nkor\nosd\n',
    );
    first.emit("close", 0, null);

    await expect(firstPromise).resolves.toEqual(new Set(["eng", "Hangul", "kor", "osd"]));
    await expect(
      getInstalledTesseractLanguages({
        executable: "/usr/local/bin/tesseract",
        timeoutMs: 5_000,
      }),
    ).resolves.toEqual(new Set(["eng", "Hangul", "kor", "osd"]));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed list-langs output instead of guessing", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const resultPromise = getInstalledTesseractLanguages({
      executable: "tesseract",
      timeoutMs: 5_000,
    });
    child.stdout.write("eng\njpn\n");
    child.emit("close", 0, null);

    await expect(resultPromise).rejects.toThrow(
      "Tesseract --list-langs returned malformed output; cannot verify installed traineddata.",
    );
  });

  it("rejects a declared language count that does not match the body", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const resultPromise = getInstalledTesseractLanguages({
      executable: "tesseract",
      timeoutMs: 5_000,
    });
    child.stdout.write('List of available languages in "/tmp/tessdata/" (2):\neng\n');
    child.emit("close", 0, null);

    await expect(resultPromise).rejects.toThrow("declared 2 languages but returned 1");
  });

  it("reports list-langs startup failure clearly", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const resultPromise = getInstalledTesseractLanguages({
      executable: "/missing/tesseract",
      timeoutMs: 5_000,
    });
    child.emit(
      "error",
      Object.assign(new Error("spawn /missing/tesseract ENOENT"), { code: "ENOENT" }),
    );

    await expect(resultPromise).rejects.toThrow(
      "Tesseract executable not found while checking installed language packs.",
    );
  });

  it("reports a nonzero list-langs exit with bounded diagnostics", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const resultPromise = getInstalledTesseractLanguages({
      executable: "tesseract",
      timeoutMs: 5_000,
    });
    child.stderr.write("failed to load tessdata");
    child.emit("close", 1, null);

    await expect(resultPromise).rejects.toThrow(
      "Unable to inspect Tesseract language packs: --list-langs exited with code 1: failed to load tessdata",
    );
  });

  it("terminates a hung list-langs preflight within its deadline", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValueOnce(child);

    const resultPromise = getInstalledTesseractLanguages({
      executable: "tesseract",
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(100);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow(
      "Tesseract language-pack preflight timed out after 100ms",
    );
  });
});
