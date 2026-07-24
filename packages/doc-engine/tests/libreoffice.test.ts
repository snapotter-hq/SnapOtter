import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChild, type FakeChild, settleClose, settleError } from "./helpers/fake-child.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:crypto", () => ({ randomUUID: () => "FIXED-UUID" }));
vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));

const readdir = vi.fn<(dir: string) => Promise<string[]>>();
const rm = vi.fn<() => Promise<void>>(async () => {});
vi.mock("node:fs/promises", () => ({
  readdir: (dir: string) => readdir(dir),
  rm: (...a: unknown[]) => rm(...(a as [])),
}));

const mockSpawn = vi.mocked(spawn);

function nextClose(
  opts: { stderr?: string; code?: number | null; signal?: string | null } = {},
): void {
  mockSpawn.mockImplementationOnce(() => {
    const child = createFakeChild();
    settleClose(child, opts);
    return child as never;
  });
}
function nextError(err: Error): void {
  mockSpawn.mockImplementationOnce(() => {
    const child = createFakeChild();
    settleError(child, err);
    return child as never;
  });
}
function nextManual(): FakeChild {
  const child = createFakeChild();
  mockSpawn.mockImplementationOnce(() => child as never);
  return child;
}
function lastArgs(): string[] {
  const calls = mockSpawn.mock.calls;
  return calls[calls.length - 1][1] as string[];
}
function lastBin(): string {
  const calls = mockSpawn.mock.calls;
  return calls[calls.length - 1][0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  rm.mockResolvedValue(undefined);
  process.env.SOFFICE_PATH = "/usr/bin/soffice";
  delete process.env.SUBPROCESS_MEMORY_LIMIT_MB;
});

afterEach(() => {
  delete process.env.SOFFICE_PATH;
});

describe("parseConvertTarget", () => {
  it("passes a bare extension through unchanged", async () => {
    const { parseConvertTarget } = await import("../src/libreoffice.js");
    expect(parseConvertTarget("pdf")).toEqual({ ext: "pdf", convertTo: "pdf" });
  });

  it("splits a qualified target on the first colon", async () => {
    const { parseConvertTarget } = await import("../src/libreoffice.js");
    expect(parseConvertTarget("docx:MS Word 2007 XML")).toEqual({
      ext: "docx",
      convertTo: "docx:MS Word 2007 XML",
    });
  });

  it("keeps everything after the first colon in convertTo when the filter has a colon", async () => {
    const { parseConvertTarget } = await import("../src/libreoffice.js");
    expect(parseConvertTarget("txt:Text:Encoded")).toEqual({
      ext: "txt",
      convertTo: "txt:Text:Encoded",
    });
  });

  it("yields an empty extension for a leading colon", async () => {
    const { parseConvertTarget } = await import("../src/libreoffice.js");
    expect(parseConvertTarget(":Filter")).toEqual({ ext: "", convertTo: ":Filter" });
  });
});

describe("convertDocument argv", () => {
  it("builds the full headless argv with a per-run profile URL", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.pdf"]);
    await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
    );
    expect(lastBin()).toBe("/usr/bin/soffice");
    expect(lastArgs()).toEqual([
      "-env:UserInstallation=file:///tmp/snapotter-lo-FIXED-UUID",
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--nodefault",
      "--convert-to",
      "pdf",
      "--outdir",
      "/outdir",
      "/docs/report.docx",
    ]);
  });

  it("passes the full qualified filter string to --convert-to", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.docx"]);
    await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.odt", "/outdir", "docx:MS Word 2007 XML"),
    );
    const args = lastArgs();
    const idx = args.indexOf("--convert-to");
    expect(args[idx + 1]).toBe("docx:MS Word 2007 XML");
  });
});

describe("convertDocument success path", () => {
  it("returns the produced file path joined onto outDir", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["other.txt", "report.pdf", "extra.log"]);
    const out = await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
    );
    expect(out).toBe("/outdir/report.pdf");
  });

  it("matches the produced file by <basename>.<ext>, stripping the input extension", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["my.report.pdf"]);
    const out = await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/my.report.pptx", "/outdir", "pdf"),
    );
    expect(out).toBe("/outdir/my.report.pdf");
  });

  it("reads the output directory to find the produced file", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.pdf"]);
    await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.docx", "/theoutdir", "pdf"),
    );
    expect(readdir).toHaveBeenCalledWith("/theoutdir");
  });

  it("throws when the expected output file is absent from outDir", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["something-else.pdf", "report.txt"]);
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toThrow("LibreOffice produced no pdf output for report.docx");
  });
});

describe("convertDocument failure paths", () => {
  it("rejects on non-zero exit with the stderr tail", async () => {
    nextClose({ stderr: "source file could not be loaded", code: 1 });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toThrow("LibreOffice exited 1: source file could not be loaded");
  });

  it("reports the signal when code is null", async () => {
    nextClose({ stderr: "crashed", code: null, signal: "SIGSEGV" });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toThrow("LibreOffice exited SIGSEGV: crashed");
  });

  it("rejects on an error event", async () => {
    nextError(new Error("spawn soffice ENOENT"));
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toThrow("spawn soffice ENOENT");
  });

  it("throws when the soffice binary is unavailable", async () => {
    vi.resetModules();
    vi.doMock("../src/binaries.js", () => ({ resolveSoffice: () => null }));
    const mod = await import("../src/libreoffice.js");
    await expect(mod.convertDocument("/docs/report.docx", "/outdir", "pdf")).rejects.toThrow(
      "soffice binary not found (set SOFFICE_PATH or install LibreOffice)",
    );
    vi.doUnmock("../src/binaries.js");
    vi.resetModules();
  });
});

describe("convertDocument profile cleanup", () => {
  it("removes the per-run profile dir after a successful conversion", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.pdf"]);
    await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
    );
    expect(rm).toHaveBeenCalledWith("/tmp/snapotter-lo-FIXED-UUID", {
      recursive: true,
      force: true,
    });
  });

  it("removes the profile dir even when the conversion fails", async () => {
    nextClose({ stderr: "boom", code: 1 });
    await import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch(() => {});
    expect(rm).toHaveBeenCalledWith("/tmp/snapotter-lo-FIXED-UUID", {
      recursive: true,
      force: true,
    });
  });

  it("swallows a cleanup failure and still surfaces the conversion result", async () => {
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.pdf"]);
    rm.mockRejectedValueOnce(new Error("EBUSY"));
    const out = await import("../src/libreoffice.js").then((m) =>
      m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
    );
    expect(out).toBe("/outdir/report.pdf");
  });
});

describe("convertDocument timeout", () => {
  it("kills with SIGKILL and rejects at the default 120s deadline", async () => {
    const mod = await import("../src/libreoffice.js");
    vi.useFakeTimers();
    try {
      const child = nextManual();
      const settled = expect(
        mod.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ).rejects.toThrow("LibreOffice timed out after 120s");
      await vi.advanceTimersByTimeAsync(120_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors a custom timeoutMs", async () => {
    const mod = await import("../src/libreoffice.js");
    vi.useFakeTimers();
    try {
      const child = nextManual();
      const settled = expect(
        mod.convertDocument("/docs/report.docx", "/outdir", "pdf", { timeoutMs: 3_000 }),
      ).rejects.toThrow("LibreOffice timed out after 3s");
      await vi.advanceTimersByTimeAsync(3_000);
      await settled;
      expect(child.killSignals).toContain("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});
