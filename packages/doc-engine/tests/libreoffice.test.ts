import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeChild, type FakeChild, settleClose, settleError } from "./helpers/fake-child.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("node:crypto", () => ({ randomUUID: () => "FIXED-UUID" }));
vi.mock("node:os", () => ({ tmpdir: () => "/tmp" }));

const readdir = vi.fn<(dir: string) => Promise<string[]>>();
const rm = vi.fn<() => Promise<void>>(async () => {});
const statfs = vi.fn<(dir: string) => Promise<{ bavail: number; bsize: number }>>();
const access = vi.fn<(dir: string, mode: number) => Promise<void>>(async () => {});
vi.mock("node:fs/promises", () => ({
  constants: { W_OK: 2 },
  access: (dir: string, mode: number) => access(dir, mode),
  readdir: (dir: string) => readdir(dir),
  rm: (...a: unknown[]) => rm(...(a as [])),
  statfs: (dir: string) => statfs(dir),
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
  access.mockResolvedValue(undefined);
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
    const err = await import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("LibreOffice exited 1: source file could not be loaded");
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
  });

  it("reports the signal and tags as an errno-coded spawn failure when code is null (#3829)", async () => {
    nextClose({ stderr: "crashed\n", code: null, signal: "SIGSEGV" });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({
      message: "LibreOffice exited SIGSEGV: crashed",
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/soffice",
      signal: "SIGSEGV",
    });
  });

  it("falls back to a spawn ENOMEM message when a signal kill produces no output (#3829)", async () => {
    nextClose({ stderr: "  \n", code: null, signal: "SIGKILL" });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({
      message: "spawn /usr/bin/soffice ENOMEM",
      code: "ENOMEM",
      syscall: "spawn",
      path: "/usr/bin/soffice",
      signal: "SIGKILL",
    });
  });

  it("tags exit codes 126 and 127 as errno-coded spawn failures (#3829)", async () => {
    nextClose({ stderr: "sh: exec format error\n", code: 126 });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({
      message: "LibreOffice exited 126: sh: exec format error",
      code: "ENOEXEC",
      syscall: "spawn",
      path: "/usr/bin/soffice",
    });

    nextClose({ stderr: "sh: soffice: not found\n", code: 127 });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({
      message: "LibreOffice exited 127: sh: soffice: not found",
      code: "ENOENT",
      syscall: "spawn",
      path: "/usr/bin/soffice",
    });
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

  it("rejects immediately with Canceled without spawning when signal is already aborted", async () => {
    const mod = await import("../src/libreoffice.js");
    const ac = new AbortController();
    ac.abort();
    await expect(
      mod.convertDocument("/docs/report.docx", "/outdir", "pdf", { signal: ac.signal }),
    ).rejects.toThrow("Canceled");
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(readdir).not.toHaveBeenCalled();
  });

  it("kills the child with SIGKILL, cleans up the profile dir, and rejects with Canceled when signal aborts mid-run", async () => {
    const mod = await import("../src/libreoffice.js");
    const child = nextManual();
    const ac = new AbortController();
    const pending = mod.convertDocument("/docs/report.docx", "/outdir", "pdf", {
      signal: ac.signal,
    });
    ac.abort();
    await expect(pending).rejects.toThrow("Canceled");
    expect(child.killSignals).toContain("SIGKILL");
    expect(readdir).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith("/tmp/snapotter-lo-FIXED-UUID", {
      recursive: true,
      force: true,
    });
  });

  it("removes the abort listener on close, error, and timeout", async () => {
    const mod = await import("../src/libreoffice.js");
    const acClose = new AbortController();
    const removeClose = vi.spyOn(acClose.signal, "removeEventListener");
    nextClose({ code: 0 });
    readdir.mockResolvedValueOnce(["report.pdf"]);
    await mod.convertDocument("/docs/report.docx", "/outdir", "pdf", { signal: acClose.signal });
    expect(removeClose).toHaveBeenCalledWith("abort", expect.any(Function));

    const acErr = new AbortController();
    const removeErr = vi.spyOn(acErr.signal, "removeEventListener");
    nextError(new Error("spawn soffice ENOENT"));
    await expect(
      mod.convertDocument("/docs/report.docx", "/outdir", "pdf", { signal: acErr.signal }),
    ).rejects.toThrow("spawn soffice ENOENT");
    expect(removeErr).toHaveBeenCalledWith("abort", expect.any(Function));

    vi.useFakeTimers();
    try {
      const acTimeout = new AbortController();
      const removeTimeout = vi.spyOn(acTimeout.signal, "removeEventListener");
      nextManual();
      const settled = expect(
        mod.convertDocument("/docs/report.docx", "/outdir", "pdf", {
          timeoutMs: 3_000,
          signal: acTimeout.signal,
        }),
      ).rejects.toThrow("LibreOffice timed out after 3s");
      await vi.advanceTimersByTimeAsync(3_000);
      await settled;
      expect(removeTimeout).toHaveBeenCalledWith("abort", expect.any(Function));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("convertDocument on a full disk (#4148)", () => {
  // Captured from LibreOffice 26.2 converting onto a volume with no room left:
  // it exits 0 and writes nothing.
  const SPACE_STDERR =
    "Error: Please verify input parameters... (SfxBaseModel::impl_store <file:///data/files/.previews/x/input.pdf> failed: 0x909(Error Area:Io Class:Space Code:9))\n";

  it("tags a missing output as ENOSPC when LibreOffice reported an out-of-space store", async () => {
    nextClose({ stderr: SPACE_STDERR, code: 0 });
    readdir.mockResolvedValueOnce([]);
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({
      message: "LibreOffice produced no pdf output for report.docx",
      code: "ENOSPC",
      syscall: "write",
    });
  });

  it("tags a non-zero exit as ENOSPC when LibreOffice reported an out-of-space store", async () => {
    nextClose({ stderr: SPACE_STDERR, code: 1 });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({ code: "ENOSPC", syscall: "write" });
  });

  it("leaves a missing output without the out-of-space store untagged", async () => {
    nextClose({
      stderr:
        "Error: Please verify input parameters... (SfxBaseModel::impl_store <file:///o/input.pdf> failed: 0x81a(Error Area:Io Class:Parameter Code:26))\n",
      code: 0,
    });
    readdir.mockResolvedValueOnce([]);
    const err = await import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch((e: unknown) => e);
    expect((err as Error).message).toBe("LibreOffice produced no pdf output for report.docx");
    expect((err as NodeJS.ErrnoException).code).toBeUndefined();
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
  });
});

describe("convertDocument when the output can't be created (#4529)", () => {
  // Captured from LibreOffice 26.2 on macOS: a volume with no free blocks at
  // all and a read-only output directory both log this line, exit 0, and
  // write nothing.
  const ACCESS_STDERR =
    "Error: Please verify input parameters... (SfxBaseModel::impl_store <file:///outdir/report.pdf> failed: 0x507(Error Area:Io Class:Access Code:7))\n";

  async function convertWithAccessError(): Promise<unknown> {
    nextClose({ stderr: ACCESS_STDERR, code: 0 });
    readdir.mockResolvedValueOnce([]);
    return import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch((e: unknown) => e);
  }

  it("tags ENOSPC when the output volume has no free blocks", async () => {
    statfs.mockResolvedValueOnce({ bavail: 0, bsize: 4096 });
    const err = await convertWithAccessError();
    expect(statfs).toHaveBeenCalledWith("/outdir");
    expect(err).toMatchObject({
      message: "LibreOffice produced no pdf output for report.docx",
      code: "ENOSPC",
      syscall: "write",
    });
  });

  it("tags ENOSPC when only a few reserved blocks are left", async () => {
    statfs.mockResolvedValueOnce({ bavail: 8, bsize: 4096 });
    expect(await convertWithAccessError()).toMatchObject({ code: "ENOSPC", syscall: "write" });
  });

  it.each(["EACCES", "EPERM", "EROFS"])(
    "tags %s on open when the volume has room but the directory refuses writes",
    async (code) => {
      statfs.mockResolvedValueOnce({ bavail: 1_000_000, bsize: 4096 });
      access.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
      expect(await convertWithAccessError()).toMatchObject({
        message: "LibreOffice produced no pdf output for report.docx",
        code,
        syscall: "open",
        path: "/outdir",
      });
      expect(access).toHaveBeenCalledWith("/outdir", 2);
    },
  );

  it("leaves the error untagged when the volume has room and the directory is writable", async () => {
    statfs.mockResolvedValueOnce({ bavail: 1_000_000, bsize: 4096 });
    const err = await convertWithAccessError();
    expect((err as NodeJS.ErrnoException).code).toBeUndefined();
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
  });

  it("leaves the error untagged when the write check fails for another reason", async () => {
    statfs.mockResolvedValueOnce({ bavail: 1_000_000, bsize: 4096 });
    access.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect((await convertWithAccessError()) as NodeJS.ErrnoException).not.toHaveProperty("code");
  });

  it("tags a non-zero exit with the access error the same way", async () => {
    statfs.mockResolvedValueOnce({ bavail: 0, bsize: 4096 });
    nextClose({ stderr: ACCESS_STDERR, code: 1 });
    await expect(
      import("../src/libreoffice.js").then((m) =>
        m.convertDocument("/docs/report.docx", "/outdir", "pdf"),
      ),
    ).rejects.toMatchObject({ code: "ENOSPC", syscall: "write" });
  });

  it("falls back to the write check when the free space can't be read", async () => {
    statfs.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    access.mockRejectedValueOnce(Object.assign(new Error("EROFS"), { code: "EROFS" }));
    expect(await convertWithAccessError()).toMatchObject({ code: "EROFS", syscall: "open" });
  });

  it("leaves the error untagged when the free space can't be read and the directory is writable", async () => {
    statfs.mockRejectedValueOnce(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const err = await convertWithAccessError();
    expect((err as Error).message).toBe("LibreOffice produced no pdf output for report.docx");
    expect((err as NodeJS.ErrnoException).code).toBeUndefined();
    expect((err as NodeJS.ErrnoException).syscall).toBeUndefined();
  });

  it("does not check free space for an out-of-space or unrelated store error", async () => {
    nextClose({ stderr: "Error Area:Io Class:Space Code:9\n", code: 0 });
    readdir.mockResolvedValueOnce([]);
    await import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch(() => {});
    nextClose({ stderr: "source file could not be loaded", code: 1 });
    await import("../src/libreoffice.js")
      .then((m) => m.convertDocument("/docs/report.docx", "/outdir", "pdf"))
      .catch(() => {});
    expect(statfs).not.toHaveBeenCalled();
    expect(access).not.toHaveBeenCalled();
  });
});
