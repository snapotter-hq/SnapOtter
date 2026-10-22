import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { qpdfAvailable, sofficeAvailable } from "@snapotter/doc-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBinarySpawnFailure } from "../../../apps/api/src/lib/binary-overrides.js";

describe("doc-engine binary resolution", () => {
  it("availability checks return booleans without throwing", () => {
    expect(typeof qpdfAvailable()).toBe("boolean");
    expect(typeof sofficeAvailable()).toBe("boolean");
  });
});

describe("qpdf exit and signal handling (#1331, #2920)", () => {
  let dir: string;
  let stubPath: string;
  let pdfPath: string;
  const savedQpdfPath = process.env.QPDF_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "snapotter-qpdf-reqpw-"));
    stubPath = join(dir, "qpdf");
    pdfPath = join(dir, "input.pdf");
    writeFileSync(pdfPath, "%PDF-1.4\n");
    process.env.QPDF_PATH = stubPath;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (savedQpdfPath === undefined) delete process.env.QPDF_PATH;
    else process.env.QPDF_PATH = savedQpdfPath;
    vi.resetModules();
  });

  async function runWithStub(scriptBody: string): Promise<boolean> {
    writeFileSync(stubPath, `#!/bin/sh\n${scriptBody}\n`);
    chmodSync(stubPath, 0o755);
    const { qpdfRequiresPassword } = await import("@snapotter/doc-engine");
    return qpdfRequiresPassword(pdfPath);
  }

  it("maps exit 0 to true and exits 2 and 3 to false", async () => {
    await expect(runWithStub("exit 0")).resolves.toBe(true);
    await expect(runWithStub("exit 2")).resolves.toBe(false);
    await expect(runWithStub("exit 3")).resolves.toBe(false);
  });

  it("rejects exit 126 and 127 as errno-coded spawn failures", async () => {
    const err126 = await runWithStub('echo "Exec format error" >&2\nexit 126').catch(
      (e: unknown) => e,
    );
    expect(isBinarySpawnFailure(err126)).toBe(true);
    expect(err126).toMatchObject({ code: "ENOEXEC", syscall: "spawn", path: stubPath });

    const err127 = await runWithStub('echo "not found" >&2\nexit 127').catch((e: unknown) => e);
    expect(isBinarySpawnFailure(err127)).toBe(true);
    expect(err127).toMatchObject({ code: "ENOENT", syscall: "spawn", path: stubPath });
  });

  it("rejects a signal kill (code === null) as an errno-coded spawn failure", async () => {
    const err = await runWithStub("kill -TERM $$").catch((e: unknown) => e);
    expect(isBinarySpawnFailure(err)).toBe(true);
    expect(err).toMatchObject({
      code: "ENOMEM",
      syscall: "spawn",
      path: stubPath,
      signal: "SIGTERM",
    });
  });

  it("rejects any other non-zero exit code with a plain qpdf error carrying stderr", async () => {
    const err = await runWithStub('echo "qpdf: broken object stream" >&2\nexit 1').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(isBinarySpawnFailure(err)).toBe(false);
    expect((err as Error).message).toBe("qpdf exited 1: qpdf: broken object stream\n");
  });

  it("attaches errno-coded spawn metadata when qpdfCheck or qpdfPageCount exits 126/127 or dies by signal (#2920)", async () => {
    writeFileSync(stubPath, '#!/bin/sh\necho "Exec format error" >&2\nexit 126\n');
    chmodSync(stubPath, 0o755);
    const { qpdfCheck, qpdfPageCount } = await import("@snapotter/doc-engine");

    const err126 = await qpdfCheck(pdfPath).catch((e: unknown) => e);
    expect(isBinarySpawnFailure(err126)).toBe(true);
    expect(err126).toMatchObject({ code: "ENOEXEC", syscall: "spawn", path: stubPath });

    writeFileSync(stubPath, '#!/bin/sh\necho "not found" >&2\nexit 127\n');
    chmodSync(stubPath, 0o755);
    const err127 = await qpdfPageCount(pdfPath).catch((e: unknown) => e);
    expect(isBinarySpawnFailure(err127)).toBe(true);
    expect(err127).toMatchObject({ code: "ENOENT", syscall: "spawn", path: stubPath });

    writeFileSync(stubPath, "#!/bin/sh\nkill -TERM $$\n");
    chmodSync(stubPath, 0o755);
    const errSig = await qpdfPageCount(pdfPath).catch((e: unknown) => e);
    expect(isBinarySpawnFailure(errSig)).toBe(true);
    expect(errSig).toMatchObject({
      code: "ENOMEM",
      syscall: "spawn",
      path: stubPath,
      signal: "SIGTERM",
    });
  });

  it("kills spawned ghostscript, libreoffice, pdfcpu, and qpdf child processes when signal aborts (#3305)", async () => {
    const savedGsPath = process.env.GS_PATH;
    const savedSofficePath = process.env.SOFFICE_PATH;
    const savedPdfcpuPath = process.env.PDFCPU_PATH;
    const gsStub = join(dir, "gs");
    const sofficeStub = join(dir, "soffice");
    const pdfcpuStub = join(dir, "pdfcpu");
    const pidFile = join(dir, "spawned.pid");
    // Write $$ and exec sleep 30 so /bin/sh replaces its process image with
    // sleep under the same PID; SIGKILL from onAbort then terminates sleep
    // directly instead of leaving an orphaned child process.
    const sleepStub = `#!/bin/sh\necho $$ > "${pidFile}"\nexec sleep 30\n`;
    for (const p of [stubPath, gsStub, sofficeStub, pdfcpuStub]) {
      writeFileSync(p, sleepStub);
      chmodSync(p, 0o755);
    }
    process.env.GS_PATH = gsStub;
    process.env.SOFFICE_PATH = sofficeStub;
    process.env.PDFCPU_PATH = pdfcpuStub;
    vi.resetModules();

    try {
      const { existsSync, readFileSync } = await import("node:fs");
      const {
        convertDocument,
        gsGrayscalePdf,
        pdfcpuCropMargin,
        qpdfCheck,
        qpdfLinearize,
        qpdfRequiresPassword,
      } = await import("@snapotter/doc-engine");

      const runners = [
        (signal: AbortSignal) => gsGrayscalePdf(pdfPath, join(dir, "gs-out.pdf"), { signal }),
        (signal: AbortSignal) => convertDocument(pdfPath, dir, "pdf", { signal }),
        (signal: AbortSignal) =>
          pdfcpuCropMargin(pdfPath, 10, join(dir, "crop-out.pdf"), { signal }),
        (signal: AbortSignal) => qpdfCheck(pdfPath, { signal }),
        (signal: AbortSignal) => qpdfRequiresPassword(pdfPath, { signal }),
        (signal: AbortSignal) => qpdfLinearize(pdfPath, join(dir, "lin-out.pdf"), { signal }),
      ];

      for (const run of runners) {
        rmSync(pidFile, { force: true });
        const ac = new AbortController();
        const pending = run(ac.signal);
        await vi.waitFor(() => {
          expect(existsSync(pidFile)).toBe(true);
        });
        const pid = Number(readFileSync(pidFile, "utf8").trim());
        expect(Number.isInteger(pid) && pid > 0).toBe(true);
        ac.abort();
        await expect(pending).rejects.toThrow("Canceled");
        await vi.waitFor(() => {
          expect(() => process.kill(pid, 0)).toThrow();
        });
      }
    } finally {
      if (savedGsPath === undefined) delete process.env.GS_PATH;
      else process.env.GS_PATH = savedGsPath;
      if (savedSofficePath === undefined) delete process.env.SOFFICE_PATH;
      else process.env.SOFFICE_PATH = savedSofficePath;
      if (savedPdfcpuPath === undefined) delete process.env.PDFCPU_PATH;
      else process.env.PDFCPU_PATH = savedPdfcpuPath;
    }
  });
});
