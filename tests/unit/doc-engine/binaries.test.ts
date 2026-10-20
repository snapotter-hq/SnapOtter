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
});
