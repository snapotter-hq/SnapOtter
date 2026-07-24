import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * binaries.ts is a pure resolver with a module-level cache. Each test resets the
 * module registry so the cache starts empty, then installs a fresh spawnSync mock
 * via vi.doMock. That lets us assert:
 *   - env override wins and short-circuits `which`
 *   - `which` is invoked with the right platform command + args
 *   - status != 0 or empty stdout resolves to null
 *   - multi-line `which` output keeps only the first line
 *   - the result is cached (second call does not re-invoke spawnSync)
 */

type SpawnSyncResult = { status: number | null; stdout: string };

async function loadBinaries(impl: (cmd: string, args: string[]) => SpawnSyncResult) {
  const spawnSync = vi.fn(impl);
  vi.doMock("node:child_process", () => ({ spawnSync }));
  const mod = await import("../src/binaries.js");
  return { mod, spawnSync };
}

const ENV_KEYS = ["QPDF_PATH", "SOFFICE_PATH", "GS_PATH", "PDFCPU_PATH"] as const;

beforeEach(() => {
  vi.resetModules();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  vi.doUnmock("node:child_process");
  for (const k of ENV_KEYS) delete process.env[k];
});

describe("resolveBin env override", () => {
  it("returns the env var value and never calls which", async () => {
    const { mod, spawnSync } = await loadBinaries(() => ({ status: 0, stdout: "/which/qpdf\n" }));
    process.env.QPDF_PATH = "/env/qpdf";
    expect(mod.resolveQpdf()).toBe("/env/qpdf");
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("env override is not overridden by a which hit", async () => {
    const { mod } = await loadBinaries(() => ({ status: 0, stdout: "/which/soffice\n" }));
    process.env.SOFFICE_PATH = "/custom/soffice";
    expect(mod.resolveSoffice()).toBe("/custom/soffice");
  });

  it("each resolver reads its own env var name", async () => {
    const { mod } = await loadBinaries(() => ({ status: 1, stdout: "" }));
    process.env.QPDF_PATH = "/q";
    process.env.SOFFICE_PATH = "/s";
    process.env.GS_PATH = "/g";
    process.env.PDFCPU_PATH = "/p";
    expect(mod.resolveQpdf()).toBe("/q");
    expect(mod.resolveSoffice()).toBe("/s");
    expect(mod.resolveGs()).toBe("/g");
    expect(mod.resolvePdfcpu()).toBe("/p");
  });
});

describe("resolveBin which fallback", () => {
  it("returns the trimmed first line of which stdout on status 0", async () => {
    const { mod } = await loadBinaries(() => ({
      status: 0,
      stdout: "/first/qpdf\n/second/qpdf\n",
    }));
    expect(mod.resolveQpdf()).toBe("/first/qpdf");
  });

  it("invokes which with the binary name (non-win32)", async () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      const { mod, spawnSync } = await loadBinaries(() => ({ status: 0, stdout: "/bin/gs\n" }));
      mod.resolveGs();
      expect(spawnSync).toHaveBeenCalledWith("which", ["gs"], { encoding: "utf8" });
    } finally {
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("uses `where` on win32", async () => {
    const orig = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      const { mod, spawnSync } = await loadBinaries(() => ({ status: 0, stdout: "C:\\gs.exe\n" }));
      mod.resolveGs();
      expect(spawnSync).toHaveBeenCalledWith("where", ["gs"], { encoding: "utf8" });
    } finally {
      if (orig) Object.defineProperty(process, "platform", orig);
    }
  });

  it("returns null when which exits non-zero", async () => {
    const { mod } = await loadBinaries(() => ({ status: 1, stdout: "/ignored/qpdf\n" }));
    expect(mod.resolveQpdf()).toBeNull();
  });

  it("returns null when which stdout is empty despite status 0", async () => {
    const { mod } = await loadBinaries(() => ({ status: 0, stdout: "   \n" }));
    expect(mod.resolveQpdf()).toBeNull();
  });

  it("returns null when which status is null", async () => {
    const { mod } = await loadBinaries(() => ({ status: null, stdout: "/x\n" }));
    expect(mod.resolveQpdf()).toBeNull();
  });
});

describe("resolveBin cache", () => {
  it("caches the resolved path: second call does not re-invoke spawnSync", async () => {
    const { mod, spawnSync } = await loadBinaries(() => ({ status: 0, stdout: "/bin/qpdf\n" }));
    expect(mod.resolveQpdf()).toBe("/bin/qpdf");
    expect(mod.resolveQpdf()).toBe("/bin/qpdf");
    expect(mod.resolveQpdf()).toBe("/bin/qpdf");
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it("caches a null result too (does not retry which)", async () => {
    const { mod, spawnSync } = await loadBinaries(() => ({ status: 1, stdout: "" }));
    expect(mod.resolveQpdf()).toBeNull();
    expect(mod.resolveQpdf()).toBeNull();
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it("keeps separate cache entries per binary", async () => {
    const seen: string[] = [];
    const { mod, spawnSync } = await loadBinaries((_cmd, args) => {
      seen.push(args[0]);
      return { status: 0, stdout: `/bin/${args[0]}\n` };
    });
    expect(mod.resolveQpdf()).toBe("/bin/qpdf");
    expect(mod.resolveGs()).toBe("/bin/gs");
    expect(mod.resolvePdfcpu()).toBe("/bin/pdfcpu");
    expect(mod.resolveSoffice()).toBe("/bin/soffice");
    expect(spawnSync).toHaveBeenCalledTimes(4);
    expect(seen).toEqual(["qpdf", "gs", "pdfcpu", "soffice"]);
  });
});

describe("availability predicates", () => {
  it("qpdfAvailable is true when resolved, false when null", async () => {
    const { mod: found } = await loadBinaries(() => ({ status: 0, stdout: "/bin/qpdf\n" }));
    expect(found.qpdfAvailable()).toBe(true);

    vi.resetModules();
    const { mod: missing } = await loadBinaries(() => ({ status: 1, stdout: "" }));
    expect(missing.qpdfAvailable()).toBe(false);
  });

  it("each predicate mirrors its resolver", async () => {
    const { mod } = await loadBinaries((_cmd, args) =>
      args[0] === "gs" ? { status: 1, stdout: "" } : { status: 0, stdout: `/bin/${args[0]}\n` },
    );
    expect(mod.sofficeAvailable()).toBe(true);
    expect(mod.pdfcpuAvailable()).toBe(true);
    expect(mod.gsAvailable()).toBe(false);
  });
});
