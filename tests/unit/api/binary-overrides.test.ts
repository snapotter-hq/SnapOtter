import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BINARY_OVERRIDE_VARS,
  binaryOverrideWarning,
  checkBinaryOverrides,
  isBinarySpawnFailure,
  probeFailureLevel,
} from "../../../apps/api/src/lib/binary-overrides.js";

/** The `*_PATH` names in the `# Engine binary overrides` block of `.env.example`. */
function documentedBinaryOverrides(): string[] {
  const lines = readFileSync(resolve(import.meta.dirname, "../../../.env.example"), "utf8").split(
    /\r?\n/,
  );
  const start = lines.findIndex((line) => line.startsWith("# Engine binary overrides"));
  expect(start).toBeGreaterThanOrEqual(0);
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "") break;
    const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*_PATH)=/);
    if (match) names.push(match[1]);
  }
  return names;
}

/**
 * #1310: a wrong *_PATH override boots clean and then every upload that needs
 * the binary fails as a bare 500. The boot check names the variable and the
 * path so the admin learns it from the log, not from Sentry.
 */
describe("checkBinaryOverrides", () => {
  it("covers every binary override .env.example documents", () => {
    const documented = documentedBinaryOverrides();
    expect(documented.length).toBeGreaterThanOrEqual(5);
    expect([...BINARY_OVERRIDE_VARS]).toEqual(documented);
  });

  it("ignores overrides that are unset or empty", () => {
    const problems = checkBinaryOverrides({ QPDF_PATH: "", SOFFICE_PATH: undefined }, () => {
      throw new Error("must not probe an empty override");
    });
    expect(problems).toEqual([]);
  });

  it("reports each set override whose path is not an executable file", () => {
    const problems = checkBinaryOverrides(
      { FFMPEG_PATH: "/opt/ffmpeg/bin/ffmpeg", QPDF_PATH: "/usr/bin/qpdf", PDFCPU_PATH: "/ok" },
      (path) => (path === "/ok" ? null : "does not exist"),
    );
    expect(problems).toEqual([
      { variable: "FFMPEG_PATH", path: "/opt/ffmpeg/bin/ffmpeg", reason: "does not exist" },
      { variable: "QPDF_PATH", path: "/usr/bin/qpdf", reason: "does not exist" },
    ]);
  });

  describe("with the real filesystem probe", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "snapotter-binary-overrides-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("tells a missing path apart from a file that is not executable", () => {
      const plain = join(dir, "qpdf");
      writeFileSync(plain, "#!/bin/sh\n");
      chmodSync(plain, 0o644);
      const problems = checkBinaryOverrides({
        QPDF_PATH: plain,
        SOFFICE_PATH: join(dir, "missing-soffice"),
      });
      expect(problems).toEqual([
        { variable: "QPDF_PATH", path: plain, reason: "is not executable" },
        { variable: "SOFFICE_PATH", path: join(dir, "missing-soffice"), reason: "does not exist" },
      ]);
    });

    it("reports a path routed through a file as missing, not as a permissions problem", () => {
      const plain = join(dir, "qpdf");
      writeFileSync(plain, "#!/bin/sh\n");
      const through = join(plain, "qpdf");
      expect(checkBinaryOverrides({ QPDF_PATH: through })).toEqual([
        { variable: "QPDF_PATH", path: through, reason: "does not exist" },
      ]);
    });

    it("rejects a directory, the install dir given instead of the binary", () => {
      expect(checkBinaryOverrides({ FFMPEG_PATH: dir })).toEqual([
        { variable: "FFMPEG_PATH", path: dir, reason: "is not executable" },
      ]);
    });

    it("accepts an executable file", () => {
      const exe = join(dir, "ffprobe");
      writeFileSync(exe, "#!/bin/sh\n");
      chmodSync(exe, 0o755);
      expect(checkBinaryOverrides({ FFPROBE_PATH: exe })).toEqual([]);
    });
  });
});

describe("binaryOverrideWarning", () => {
  it("names the variable, the path, and the consequence", () => {
    const line = binaryOverrideWarning({
      variable: "QPDF_PATH",
      path: "/usr/bin/qpdf",
      reason: "does not exist",
    });
    expect(line).toContain("QPDF_PATH=/usr/bin/qpdf");
    expect(line).toContain("does not exist");
    expect(line).toMatch(/will fail/);
  });
});

describe("isBinarySpawnFailure", () => {
  it("recognises any errno Node reports from the spawn itself", () => {
    // ENOEXEC is a binary for the wrong architecture, ENOTDIR a path routed
    // through a file: both mean the override, never the input.
    for (const code of ["ENOENT", "EACCES", "ENOEXEC", "ENOTDIR"]) {
      const err = Object.assign(new Error(`spawn /x ${code}`), { code, syscall: "spawn" });
      expect(isBinarySpawnFailure(err), code).toBe(true);
    }
  });

  it("matches the shape Node itself produces, where the syscall carries the path", () => {
    const real = Object.assign(new Error("spawn /opt/qpdf ENOENT"), {
      code: "ENOENT",
      syscall: "spawn /opt/qpdf",
      path: "/opt/qpdf",
    });
    expect(isBinarySpawnFailure(real)).toBe(true);
    const sync = Object.assign(new Error("spawnSync /opt/qpdf ENOEXEC"), {
      code: "ENOEXEC",
      syscall: "spawnSync /opt/qpdf",
    });
    expect(isBinarySpawnFailure(sync)).toBe(true);
  });

  it("leaves every other failure alone, including an errno from a different syscall", () => {
    expect(isBinarySpawnFailure(new Error("xref table is corrupt"))).toBe(false);
    expect(isBinarySpawnFailure(Object.assign(new Error("boom"), { code: "ETIMEDOUT" }))).toBe(
      false,
    );
    expect(
      isBinarySpawnFailure(
        Object.assign(new Error("open /tmp/in.pdf ENOENT"), { code: "ENOENT", syscall: "open" }),
      ),
    ).toBe(false);
    expect(isBinarySpawnFailure("ENOENT")).toBe(false);
    expect(isBinarySpawnFailure(null)).toBe(false);
  });
});

describe("probeFailureLevel", () => {
  it("warns when an explicit FFMPEG_PATH could not be probed, stays at info for the image's own binary", () => {
    expect(probeFailureLevel("/opt/ffmpeg")).toBe("warn");
    expect(probeFailureLevel("")).toBe("info");
    expect(probeFailureLevel(undefined)).toBe("info");
  });
});
