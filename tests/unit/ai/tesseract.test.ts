import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSpawn = vi.hoisted(() => vi.fn());
const mockGetInstalledTesseractLanguages = vi.hoisted(() => vi.fn());
const mockGetCachedTesseractLanguages = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ spawn: mockSpawn }));
vi.mock("../../../packages/ai/src/tesseract-languages.js", () => ({
  getCachedTesseractLanguages: mockGetCachedTesseractLanguages,
  getInstalledTesseractLanguages: mockGetInstalledTesseractLanguages,
}));

import {
  getTesseractRuntimeMetadata,
  resolveTesseractLanguage,
  runAdaptiveTesseract,
  runTesseract,
  selectTesseractLanguageFamily,
  selectTesseractLayout,
} from "../../../packages/ai/src/tesseract.js";

const TSV_HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

function tsvWords(...words: Array<{ confidence: number; line?: number; text: string }>): string {
  return [
    TSV_HEADER,
    ...words.map(
      (word, index) =>
        `5\t1\t1\t1\t${word.line ?? 1}\t${index + 1}\t0\t0\t20\t10\t${word.confidence}\t${word.text}`,
    ),
  ].join("\n");
}

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
  const fullInventory = new Set(["eng", "deu", "fra", "spa", "chi_sim", "jpn", "osd"]);
  mockGetInstalledTesseractLanguages.mockResolvedValue(fullInventory);
  mockGetCachedTesseractLanguages.mockReturnValue(fullInventory);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resolveTesseractLanguage", () => {
  it.each([
    ["en", "eng"],
    ["de", "deu"],
    ["fr", "fra"],
    ["es", "spa"],
    ["zh", "chi_sim"],
    ["ja", "jpn"],
  ] as const)("maps %s to the installed Tesseract language %s", (language, expected) => {
    expect(resolveTesseractLanguage(language)).toBe(expected);
  });

  it("uses every supported language for auto detection", () => {
    expect(resolveTesseractLanguage("auto")).toBe("eng+deu+fra+spa+chi_sim+jpn");
  });

  it("rejects unsupported runtime language values", () => {
    expect(() => resolveTesseractLanguage("it" as "en")).toThrow('Unsupported OCR language "it"');
  });
});

describe("runTesseract", () => {
  it("runs Tesseract without a shell and returns stdout with runtime metadata", async () => {
    const child = createMockChild();
    const onProgress = vi.fn();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input file.png", {
      language: "ja",
      onProgress,
      tesseractPath: "/usr/local/bin/tesseract",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "/usr/local/bin/tesseract",
      ["/tmp/input file.png", "stdout", "-l", "jpn"],
      {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    child.stdout.write("Recognized text\n");
    child.emit("close", 0, null);

    await expect(resultPromise).resolves.toEqual({
      text: "Recognized text\n",
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });
    expect(onProgress).toHaveBeenNthCalledWith(1, 0, "Starting Tesseract OCR");
    expect(onProgress).toHaveBeenLastCalledWith(100, "Tesseract OCR complete");
  });

  it("defaults to all supported languages", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png");
    expect(mockSpawn.mock.calls[0][1]).toEqual([
      "/tmp/input.png",
      "stdout",
      "-l",
      "eng+deu+fra+spa+chi_sim+jpn",
    ]);
    child.emit("close", 0, null);

    await resultPromise;
  });

  it.each([
    "Hangul",
    "kor",
  ])("ignores legacy installed Korean model %s when resolving Fast auto languages", async (koreanModel) => {
    const child = createMockChild();
    const inventory = new Set(["eng", koreanModel, "osd"]);
    mockGetCachedTesseractLanguages.mockReturnValueOnce(inventory);
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/mixed.png", { language: "auto" });
    const language = mockSpawn.mock.calls[0]?.[1]?.[3];
    child.emit("close", 0, null);

    await resultPromise;
    expect(language).toBe("eng");
  });

  it("uses the installed supported subset for auto on a partial native host", async () => {
    const child = createMockChild();
    mockGetCachedTesseractLanguages.mockReturnValueOnce(new Set(["eng", "osd"]));
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png");
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0][1]).toEqual(["/tmp/input.png", "stdout", "-l", "eng"]);
    child.emit("close", 0, null);

    await resultPromise;
  });

  it("fails an explicit missing language with cross-platform installation guidance", async () => {
    mockGetCachedTesseractLanguages.mockReturnValueOnce(new Set(["eng", "osd"]));

    await expect(runTesseract("/tmp/input.png", { language: "ja" })).rejects.toThrow(
      'Tesseract language "ja" is unavailable: missing traineddata "jpn". Install Debian/Ubuntu package tesseract-ocr-jpn or the equivalent traineddata pack (Homebrew: brew install tesseract-lang), then restart SnapOtter.',
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("uses the real Debian package name for missing Simplified Chinese traineddata", async () => {
    mockGetCachedTesseractLanguages.mockReturnValueOnce(new Set(["eng", "osd"]));

    await expect(runTesseract("/tmp/input.png", { language: "zh" })).rejects.toThrow(
      "Install Debian/Ubuntu package tesseract-ocr-chi-sim",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("rejects a raw Korean language value before spawning Tesseract", async () => {
    mockGetCachedTesseractLanguages.mockReturnValueOnce(undefined);

    await expect(runTesseract("/tmp/korean.png", { language: "ko" as never })).rejects.toThrow(
      'Unsupported OCR language "ko"',
    );
    expect(mockGetInstalledTesseractLanguages).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it.each([
    "Hangul",
    "kor",
    "jpn+Hangul",
    "Hangul/../../eng",
    "Hangul+kor",
  ])("rejects unsafe internal language set %s before spawning", async (tesseractLanguages) => {
    mockGetCachedTesseractLanguages.mockReturnValueOnce(new Set(["eng", "osd"]));
    await expect(
      runTesseract("/tmp/input.png", { language: "auto", tesseractLanguages }),
    ).rejects.toThrow("Unsupported internal Tesseract language set");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("fails auto clearly when no supported traineddata is installed", async () => {
    mockGetCachedTesseractLanguages.mockReturnValueOnce(new Set(["osd"]));

    await expect(runTesseract("/tmp/input.png")).rejects.toThrow(
      "Tesseract has no supported traineddata installed. Install at least tesseract-ocr-eng",
    );
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("includes stderr and the exit code when Tesseract fails", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { language: "en" });
    child.stderr.write("Error opening data file");
    child.emit("close", 1, null);

    await expect(resultPromise).rejects.toThrow(
      "Tesseract exited with code 1: Error opening data file",
    );
  });

  it("preserves valid OCR output below the configured memory limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { maxOutputBytes: 32 });
    child.stdout.write("Recognized ");
    child.stdout.write("text\n");
    child.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "Recognized text\n" });
  });

  it("terminates instead of retaining stdout beyond the configured memory limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { maxOutputBytes: 32 });
    child.stdout.write(Buffer.alloc(33, 97));

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("Tesseract stdout exceeded 32 bytes");
  });

  it("terminates instead of retaining stderr beyond the configured memory limit", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { maxOutputBytes: 32 });
    child.stderr.write(Buffer.alloc(33, 97));

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("Tesseract stderr exceeded 32 bytes");
  });

  it("supports an independent stdout allowance without shrinking stderr diagnostics", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", {
      maxStdoutBytes: 4,
      maxStderrBytes: 32,
    });
    child.stderr.write("diagnostic");
    child.stdout.write("12345");

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("Tesseract stdout exceeded 4 bytes");
  });

  it("reports an actionable error when the Tesseract executable is missing", async () => {
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png");
    const error = Object.assign(new Error("spawn tesseract ENOENT"), { code: "ENOENT" });
    child.emit("error", error);

    await expect(resultPromise).rejects.toThrow(
      "Tesseract executable not found. Install Tesseract or set TESSERACT_PATH.",
    );
  });

  it("does not spawn when the request is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const resultPromise = runTesseract("/tmp/input.png", { signal: controller.signal });

    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("terminates an in-flight process when the request is aborted", async () => {
    const child = createMockChild();
    const controller = new AbortController();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { signal: controller.signal });
    controller.abort();

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not miss cancellation that races with process startup", async () => {
    const child = createMockChild();
    const controller = new AbortController();
    mockSpawn.mockImplementation(() => {
      controller.abort();
      return child;
    });

    const resultPromise = runTesseract("/tmp/input.png", { signal: controller.signal });

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("terminates and rejects a process that exceeds its timeout", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    child.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("Tesseract OCR timed out after 100ms");
  });

  it("force-kills but retains ownership until the process closes", async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    const controller = new AbortController();
    mockSpawn.mockReturnValue(child);

    const resultPromise = runTesseract("/tmp/input.png", { signal: controller.signal });
    let rejected = false;
    void resultPromise.catch(() => {
      rejected = true;
    });
    const rejection = expect(resultPromise).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
    expect(rejected).toBe(false);
    child.emit("close", null, "SIGKILL");
    await rejection;
  });
});

describe("selectTesseractLayout", () => {
  it("selects sparse layout when confidence-weighted coverage materially improves", () => {
    const block = tsvWords({ confidence: 55, text: "fragment" });
    const sparse = tsvWords(
      { confidence: 94, text: "complete" },
      { confidence: 93, line: 2, text: "receipt text" },
    );

    expect(selectTesseractLayout(block, sparse)).toEqual({
      pageSegmentationMode: 11,
      text: "complete\nreceipt text",
    });
  });

  it("keeps block layout when the sparse score gain is only noise", () => {
    const block = tsvWords({ confidence: 95, text: "invoice total" });
    const sparse = tsvWords({ confidence: 96, text: "invoice total" });

    expect(selectTesseractLayout(block, sparse)).toEqual({
      pageSegmentationMode: 6,
      text: "invoice total",
    });
  });

  it("requires a conservative gain before sparse text volume can replace block layout", () => {
    const block = tsvWords({ confidence: 95, text: "invoice total" });
    const sparse = tsvWords(
      { confidence: 95, text: "invoice total" },
      { confidence: 85, line: 2, text: "tax" },
    );

    expect(selectTesseractLayout(block, sparse)).toEqual({
      pageSegmentationMode: 6,
      text: "invoice total",
    });
  });

  it("rejects malformed TSV and non-finite word confidence", () => {
    expect(() => selectTesseractLayout("not tsv", tsvWords())).toThrow("malformed TSV");
    expect(() =>
      selectTesseractLayout(tsvWords({ confidence: Number.NaN, text: "invoice" }), tsvWords()),
    ).toThrow("malformed TSV confidence");
  });
});

describe("selectTesseractLanguageFamily", () => {
  it("selects the CJK family only with material script evidence", () => {
    const latin = tsvWords({ confidence: 80, text: "receipt 505" });
    const cjk = tsvWords({ confidence: 85, text: "領収書 505" });

    expect(selectTesseractLanguageFamily(latin, cjk)).toBe("jpn+chi_sim");
  });

  it("keeps the Latin family when a candidate contains one CJK hallucination", () => {
    const latin = tsvWords({ confidence: 90, text: "invoice total" });
    const cjk = tsvWords({ confidence: 92, text: "invoice 合 total" });

    expect(selectTesseractLanguageFamily(latin, cjk)).toBe("eng+deu+fra+spa");
  });

  it("keeps the Latin family when a noisy candidate has weak CJK density", () => {
    const latin = tsvWords({ confidence: 90, text: "invoice total 505" });
    const cjk = tsvWords({ confidence: 50, text: "合計 invoice" });

    expect(selectTesseractLanguageFamily(latin, cjk)).toBe("eng+deu+fra+spa");
  });

  it("selects a mixed CJK address when comparative evidence is stronger", () => {
    const latin = tsvWords({ confidence: 65, text: "Tokyo Chiyoda Railway 1234567890" });
    const cjk = tsvWords({
      confidence: 95,
      text: "東京都千代田 Chiyoda Railway 1234567890",
    });

    expect(selectTesseractLanguageFamily(latin, cjk)).toBe("jpn+chi_sim");
  });
});

describe("runAdaptiveTesseract", () => {
  it("rejects a raw Korean language value before inventory preflight or recognition", async () => {
    await expect(
      runAdaptiveTesseract("/tmp/korean.png", { language: "ko" as never }),
    ).rejects.toThrow('Unsupported OCR language "ko"');

    expect(mockGetInstalledTesseractLanguages).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("runs an English-only auto host without probing unavailable CJK packs", async () => {
    const block = createMockChild();
    const sparse = createMockChild();
    mockGetInstalledTesseractLanguages.mockResolvedValue(new Set(["eng", "osd"]));
    mockGetCachedTesseractLanguages.mockReturnValue(new Set(["eng", "osd"]));
    mockSpawn.mockReturnValueOnce(block).mockReturnValueOnce(sparse);

    const resultPromise = runAdaptiveTesseract("/tmp/english.png", {
      language: "auto",
      timeoutMs: 5_000,
    });

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0]?.[1]).toContain("eng");
    block.stdout.write(tsvWords({ confidence: 90, text: "English text" }));
    block.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    expect(mockSpawn.mock.calls[1]?.[1]).toContain("eng");
    expect(mockSpawn.mock.calls.flatMap((call) => call[1])).not.toContain("jpn+chi_sim");
    sparse.stdout.write(tsvWords({ confidence: 80, text: "English text" }));
    sparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "English text" });
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it("probes only installed members when both auto families remain viable", async () => {
    const latinBlock = createMockChild();
    const cjkBlock = createMockChild();
    const cjkSparse = createMockChild();
    mockGetInstalledTesseractLanguages.mockResolvedValue(new Set(["eng", "jpn", "osd"]));
    mockGetCachedTesseractLanguages.mockReturnValue(new Set(["eng", "jpn", "osd"]));
    mockSpawn
      .mockReturnValueOnce(latinBlock)
      .mockReturnValueOnce(cjkBlock)
      .mockReturnValueOnce(cjkSparse);

    const resultPromise = runAdaptiveTesseract("/tmp/mixed.png", {
      language: "auto",
      timeoutMs: 5_000,
    });

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0]?.[1]).toContain("eng");
    latinBlock.stdout.write(tsvWords({ confidence: 60, text: "receipt" }));
    latinBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    expect(mockSpawn.mock.calls[1]?.[1]).toContain("jpn");
    cjkBlock.stdout.write(tsvWords({ confidence: 95, text: "日本語文字列" }));
    cjkBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    expect(mockSpawn.mock.calls[2]?.[1]).toContain("jpn");
    cjkSparse.stdout.write(tsvWords({ confidence: 80, text: "日本語文字列" }));
    cjkSparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "日本語文字列" });
    const languageArgs = mockSpawn.mock.calls.map((call) => call[1][3]);
    expect(languageArgs).toEqual(["eng", "jpn", "jpn"]);
  });

  it("runs bounded block and sparse TSV candidates without a shell", async () => {
    const block = createMockChild();
    const sparse = createMockChild();
    mockSpawn.mockReturnValueOnce(block).mockReturnValueOnce(sparse);

    const resultPromise = runAdaptiveTesseract("/tmp/receipt.png", {
      language: "ja",
      timeoutMs: 5_000,
      maxStdoutBytes: 1_000_000,
    });

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0]?.[1]).toEqual([
      "/tmp/receipt.png",
      "stdout",
      "-l",
      "jpn",
      "--psm",
      "6",
      "tsv",
    ]);
    block.stdout.write(tsvWords({ confidence: 55, text: "fragment" }));
    block.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    expect(mockSpawn.mock.calls[1]?.[1]).toEqual([
      "/tmp/receipt.png",
      "stdout",
      "-l",
      "jpn",
      "--psm",
      "11",
      "tsv",
    ]);
    sparse.stdout.write(
      tsvWords(
        { confidence: 94, text: "complete" },
        { confidence: 93, line: 2, text: "receipt text" },
      ),
    );
    sparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toEqual({
      text: "complete\nreceipt text",
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });
  });

  it("recovers weak CJK scene text through bounded horizontal tile fallbacks", async () => {
    const primaryBlock = createMockChild();
    const primarySparse = createMockChild();
    const upperBlock = createMockChild();
    const upperSparse = createMockChild();
    const lowerBlock = createMockChild();
    const lowerSparse = createMockChild();
    mockSpawn
      .mockReturnValueOnce(primaryBlock)
      .mockReturnValueOnce(primarySparse)
      .mockReturnValueOnce(upperBlock)
      .mockReturnValueOnce(upperSparse)
      .mockReturnValueOnce(lowerBlock)
      .mockReturnValueOnce(lowerSparse);

    const resultPromise = runAdaptiveTesseract("/tmp/board.png", {
      fallbackInputPaths: ["/tmp/board-upper.png", "/tmp/board-lower.png"],
      language: "ja",
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    primaryBlock.stdout.write(tsvWords({ confidence: 40, text: "僅" }));
    primaryBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    primarySparse.stdout.write(tsvWords({ confidence: 35, text: "断" }));
    primarySparse.emit("close", 0, null);

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    expect(mockSpawn.mock.calls[2]?.[1]).toEqual([
      "/tmp/board-upper.png",
      "stdout",
      "-l",
      "jpn",
      "--psm",
      "6",
      "tsv",
    ]);
    upperBlock.stdout.write(
      tsvWords({
        confidence: 94,
        text: "上段仕様表日本語文字列一二三四五六七八九十上段仕様表日本語文字列一二三四五六七八九十",
      }),
    );
    upperBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(4));
    upperSparse.stdout.write(tsvWords({ confidence: 50, text: "上段" }));
    upperSparse.emit("close", 0, null);

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(5));
    lowerBlock.stdout.write(
      tsvWords({
        confidence: 93,
        text: "下段仕様表日本語文字列十一十二十三十四十五下段仕様表日本語文字列十一十二十三十四十五",
      }),
    );
    lowerBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(6));
    lowerSparse.stdout.write(tsvWords({ confidence: 45, text: "下段" }));
    lowerSparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      text: "上段仕様表日本語文字列一二三四五六七八九十上段仕様表日本語文字列一二三四五六七八九十\n下段仕様表日本語文字列十一十二十三十四十五下段仕様表日本語文字列十一十二十三十四十五",
    });
    expect(mockSpawn).toHaveBeenCalledTimes(6);
  });

  it("does not spend tile fallback work when the primary CJK result is strong", async () => {
    const primaryBlock = createMockChild();
    const primarySparse = createMockChild();
    mockSpawn.mockReturnValueOnce(primaryBlock).mockReturnValueOnce(primarySparse);

    const resultPromise = runAdaptiveTesseract("/tmp/board.png", {
      fallbackInputPaths: ["/tmp/board-upper.png", "/tmp/board-lower.png"],
      language: "ja",
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    primaryBlock.stdout.write(
      tsvWords({
        confidence: 95,
        text: "十分な日本語文字列を含む通常の認識結果です一二三四五六七八九十",
      }),
    );
    primaryBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    primarySparse.stdout.write(tsvWords({ confidence: 50, text: "断片" }));
    primarySparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      text: "十分な日本語文字列を含む通常の認識結果です一二三四五六七八九十",
    });
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it("recovers a dense CJK board through one enhanced block candidate", async () => {
    const primaryBlock = createMockChild();
    const primarySparse = createMockChild();
    const enhancedBlock = createMockChild();
    const denseCjkInputProvider = vi.fn().mockResolvedValue("/tmp/board-dense.png");
    mockSpawn
      .mockReturnValueOnce(primaryBlock)
      .mockReturnValueOnce(primarySparse)
      .mockReturnValueOnce(enhancedBlock);

    const resultPromise = runAdaptiveTesseract("/tmp/board.png", {
      denseCjkInputProvider,
      language: "ja",
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    primaryBlock.stdout.write(tsvWords({ confidence: 45, text: "日本語の短い断片" }));
    primaryBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    primarySparse.stdout.write(
      tsvWords({ confidence: 60, text: "日本語の中程度の断片一二三四五六七八九十" }),
    );
    primarySparse.emit("close", 0, null);

    await vi.waitFor(() => expect(denseCjkInputProvider).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    expect(mockSpawn.mock.calls[2]?.[1]).toEqual([
      "/tmp/board-dense.png",
      "stdout",
      "-l",
      "jpn",
      "--psm",
      "6",
      "tsv",
    ]);
    const recovered =
      "高信頼の日本語仕様表一二三四五六七八九十高信頼の日本語仕様表一二三四五六七八九十" +
      "高信頼の日本語仕様表一二三四五六七八九十高信頼の日本語仕様表一二三四五六七八九十" +
      "高信頼の日本語仕様表一二三四五六七八九十";
    enhancedBlock.stdout.write(
      tsvWords(
        { confidence: 90, text: "|" },
        { confidence: 82, text: recovered },
        { confidence: 91, text: "||" },
      ),
    );
    enhancedBlock.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: recovered });
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it("does not preprocess a strong CJK primary result", async () => {
    const primaryBlock = createMockChild();
    const primarySparse = createMockChild();
    const denseCjkInputProvider = vi.fn().mockResolvedValue("/tmp/board-dense.png");
    mockSpawn.mockReturnValueOnce(primaryBlock).mockReturnValueOnce(primarySparse);

    const resultPromise = runAdaptiveTesseract("/tmp/board.png", {
      denseCjkInputProvider,
      language: "ja",
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    primaryBlock.stdout.write(
      tsvWords({
        confidence: 95,
        text: "十分な日本語文字列を含む通常の認識結果です一二三四五六七八九十",
      }),
    );
    primaryBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    primarySparse.stdout.write(tsvWords({ confidence: 50, text: "断片" }));
    primarySparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({
      text: "十分な日本語文字列を含む通常の認識結果です一二三四五六七八九十",
    });
    expect(denseCjkInputProvider).not.toHaveBeenCalled();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it("probes bounded language families for auto without seven-language dilution", async () => {
    const latinBlock = createMockChild();
    const cjkBlock = createMockChild();
    const cjkSparse = createMockChild();
    mockSpawn
      .mockReturnValueOnce(latinBlock)
      .mockReturnValueOnce(cjkBlock)
      .mockReturnValueOnce(cjkSparse);

    const resultPromise = runAdaptiveTesseract("/tmp/mixed.png", {
      language: "auto",
      timeoutMs: 5_000,
    });

    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0]?.[1]).toContain("eng+deu+fra+spa");
    latinBlock.stdout.write(tsvWords({ confidence: 80, text: "receipt 505" }));
    latinBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    expect(mockSpawn.mock.calls[1]?.[1]).toContain("jpn+chi_sim");
    cjkBlock.stdout.write(tsvWords({ confidence: 90, text: "領収書 505" }));
    cjkBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    expect(mockSpawn.mock.calls[2]?.[1]).toEqual([
      "/tmp/mixed.png",
      "stdout",
      "-l",
      "jpn+chi_sim",
      "--psm",
      "11",
      "tsv",
    ]);
    cjkSparse.stdout.write(tsvWords({ confidence: 70, text: "領収書" }));
    cjkSparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "領収書 505" });
    expect(mockSpawn.mock.calls.flatMap((call) => call[1] as string[])).not.toContain(
      "eng+deu+fra+spa+chi_sim+jpn",
    );
  });

  it("probes auto script on the original before recognizing a preprocessed image", async () => {
    const latinProbe = createMockChild();
    const cjkProbe = createMockChild();
    const processedBlock = createMockChild();
    const processedSparse = createMockChild();
    mockSpawn
      .mockReturnValueOnce(latinProbe)
      .mockReturnValueOnce(cjkProbe)
      .mockReturnValueOnce(processedBlock)
      .mockReturnValueOnce(processedSparse);

    const resultPromise = runAdaptiveTesseract("/tmp/original.png", {
      language: "auto",
      recognitionInputPath: "/tmp/low-contrast.png",
      timeoutMs: 5_000,
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(mockSpawn.mock.calls[0]?.[1]).toEqual([
      "/tmp/original.png",
      "stdout",
      "-l",
      "eng+deu+fra+spa",
      "--psm",
      "6",
      "tsv",
    ]);
    latinProbe.stdout.write(tsvWords({ confidence: 90, text: "invoice total 505" }));
    latinProbe.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    expect(mockSpawn.mock.calls[1]?.[1]?.[0]).toBe("/tmp/original.png");
    cjkProbe.stdout.write(tsvWords({ confidence: 50, text: "invoice 合 total" }));
    cjkProbe.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    expect(mockSpawn.mock.calls[2]?.[1]).toEqual([
      "/tmp/low-contrast.png",
      "stdout",
      "-l",
      "eng+deu+fra+spa",
      "--psm",
      "6",
      "tsv",
    ]);
    processedBlock.stdout.write(tsvWords({ confidence: 95, text: "invoice total 505" }));
    processedBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(4));
    expect(mockSpawn.mock.calls[3]?.[1]?.[0]).toBe("/tmp/low-contrast.png");
    processedSparse.stdout.write(tsvWords({ confidence: 70, text: "invoice" }));
    processedSparse.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "invoice total 505" });
  });

  it("can retain block layout for calibrated low-contrast recognition", async () => {
    const latinProbe = createMockChild();
    const cjkProbe = createMockChild();
    const processedBlock = createMockChild();
    mockSpawn
      .mockReturnValueOnce(latinProbe)
      .mockReturnValueOnce(cjkProbe)
      .mockReturnValueOnce(processedBlock);

    const resultPromise = runAdaptiveTesseract("/tmp/original.png", {
      blockLayoutOnly: true,
      language: "auto",
      recognitionInputPath: "/tmp/low-contrast.png",
    });
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    latinProbe.stdout.write(tsvWords({ confidence: 90, text: "invoice total 505" }));
    latinProbe.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    cjkProbe.stdout.write(tsvWords({ confidence: 50, text: "invoice 合 total" }));
    cjkProbe.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    processedBlock.stdout.write(tsvWords({ confidence: 95, text: "invoice total 505" }));
    processedBlock.emit("close", 0, null);

    await expect(resultPromise).resolves.toMatchObject({ text: "invoice total 505" });
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it("shares one deadline across sequential layout candidates", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const block = createMockChild();
    const sparse = createMockChild();
    mockSpawn.mockReturnValueOnce(block).mockReturnValueOnce(sparse);

    const resultPromise = runAdaptiveTesseract("/tmp/form.png", {
      language: "en",
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(40);
    monotonicNow.mockReturnValue(40);
    block.stdout.write(tsvWords({ confidence: 95, text: "form" }));
    block.emit("close", 0, null);
    await Promise.resolve();
    await Promise.resolve();
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(35);

    expect(sparse.kill).toHaveBeenCalledWith("SIGTERM");
    sparse.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("timed out");
  });

  it("reserves bounded termination grace across all three auto candidates", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    const latinBlock = createMockChild();
    const cjkBlock = createMockChild();
    const cjkSparse = createMockChild();
    mockSpawn
      .mockReturnValueOnce(latinBlock)
      .mockReturnValueOnce(cjkBlock)
      .mockReturnValueOnce(cjkSparse);

    const resultPromise = runAdaptiveTesseract("/tmp/mixed.png", {
      language: "auto",
      timeoutMs: 200,
    });
    await vi.advanceTimersByTimeAsync(20);
    monotonicNow.mockReturnValue(20);
    latinBlock.stdout.write(tsvWords({ confidence: 80, text: "receipt 505" }));
    latinBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(20);
    monotonicNow.mockReturnValue(40);
    cjkBlock.stdout.write(tsvWords({ confidence: 90, text: "領収書 505" }));
    cjkBlock.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));

    await vi.advanceTimersByTimeAsync(110);
    expect(cjkSparse.kill).toHaveBeenCalledWith("SIGTERM");
    await vi.advanceTimersByTimeAsync(50);
    expect(cjkSparse.kill).toHaveBeenCalledWith("SIGKILL");
    cjkSparse.emit("close", null, "SIGKILL");
    await expect(resultPromise).rejects.toThrow("timed out");
  });

  it("uses a monotonic aggregate deadline across wall-clock jumps", async () => {
    vi.useFakeTimers();
    const monotonicNow = vi.spyOn(performance, "now").mockReturnValue(0);
    vi.setSystemTime(new Date("2026-01-02T00:00:00Z"));
    const block = createMockChild();
    const sparse = createMockChild();
    mockSpawn.mockReturnValueOnce(block).mockReturnValueOnce(sparse);

    const resultPromise = runAdaptiveTesseract("/tmp/form.png", {
      language: "en",
      timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(20);
    monotonicNow.mockReturnValue(20);
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    block.stdout.write(tsvWords({ confidence: 95, text: "form" }));
    block.emit("close", 0, null);
    await vi.waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(55);
    expect(sparse.kill).toHaveBeenCalledWith("SIGTERM");
    sparse.emit("close", null, "SIGTERM");
    await expect(resultPromise).rejects.toThrow("timed out");
  });
});

describe("getTesseractRuntimeMetadata", () => {
  it("reports the native CPU provider on every host", () => {
    expect(getTesseractRuntimeMetadata()).toEqual({
      engine: "tesseract",
      provider: "native",
      device: "cpu",
    });
  });
});
