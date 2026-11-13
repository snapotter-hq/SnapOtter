import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runPythonWithProgress = vi.fn();
const parseStdoutJson = vi.fn();
vi.mock("../../../packages/ai/src/bridge.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../packages/ai/src/bridge.js")>();
  return {
    ...actual,
    runPythonWithProgress: (...args: unknown[]) => runPythonWithProgress(...args),
    parseStdoutJson: (...args: unknown[]) => parseStdoutJson(...args),
    isGpuAvailable: () => false,
  };
});

import { isSafeMessageError } from "@snapotter/shared";
import { classifyError, errorSignature } from "../../../apps/api/src/lib/error-report.js";
import { removeBackground } from "../../../packages/ai/src/background-removal.js";
import {
  AnimatedRemovalCanceledError,
  removeBackgroundAnimated,
} from "../../../packages/ai/src/background-removal-animated.js";
import { colorize } from "../../../packages/ai/src/colorization.js";
import { blurFaces, detectFaces } from "../../../packages/ai/src/face-detection.js";
import { enhanceFaces } from "../../../packages/ai/src/face-enhancement.js";
import { detectFaceLandmarks } from "../../../packages/ai/src/face-landmarks.js";
import { inpaint } from "../../../packages/ai/src/inpainting.js";
import { noiseRemoval } from "../../../packages/ai/src/noise-removal.js";
import { outpaint } from "../../../packages/ai/src/outpainting.js";
import { removeRedEye } from "../../../packages/ai/src/red-eye-removal.js";
import { restorePhoto } from "../../../packages/ai/src/restoration.js";
import { readScratchOutput, writeScratchInput } from "../../../packages/ai/src/scratch-io.js";
import { seamCarve } from "../../../packages/ai/src/seam-carving.js";
import { upscale } from "../../../packages/ai/src/upscaling.js";
import { extractErrorCode } from "../../../packages/shared/src/analytics/error-sanitize.js";

let png: Buffer;
let root: string;

beforeAll(async () => {
  png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
});

beforeEach(async () => {
  runPythonWithProgress.mockReset();
  parseStdoutJson.mockReset();
  runPythonWithProgress.mockResolvedValue({ stdout: '{"success":true}', stderr: "" });
  parseStdoutJson.mockReturnValue({ success: true, width: 4, height: 4 });
  root = await mkdtemp(join(tmpdir(), "i4217-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

type Run = (dir: string) => Promise<unknown>;

// Every wrapper that stages files around a sidecar call (#4217, #4612).
const WRAPPERS: Array<{ wrapper: string; run: Run; writesIntoDir: boolean }> = [
  { wrapper: "upscale", run: (dir) => upscale(png, dir, { scale: 2 }), writesIntoDir: true },
  { wrapper: "restore", run: (dir) => restorePhoto(png, dir), writesIntoDir: true },
  { wrapper: "denoise", run: (dir) => noiseRemoval(png, dir), writesIntoDir: true },
  { wrapper: "face-enhance", run: (dir) => enhanceFaces(png, dir), writesIntoDir: true },
  { wrapper: "inpaint", run: (dir) => inpaint(png, png, dir), writesIntoDir: true },
  // remove-bg stages its input under tmpdir(), so only its output read can miss.
  {
    wrapper: "remove-bg",
    run: (dir) => removeBackground(png, dir, { model: "u2net", oomFallbackModel: false }),
    writesIntoDir: false,
  },
  { wrapper: "colorize", run: (dir) => colorize(png, dir), writesIntoDir: true },
  {
    wrapper: "outpaint",
    run: (dir) =>
      outpaint(png, { extendTop: 1, extendRight: 1, extendBottom: 1, extendLeft: 1 }, dir),
    writesIntoDir: true,
  },
  { wrapper: "red-eye", run: (dir) => removeRedEye(png, dir), writesIntoDir: true },
  { wrapper: "blur-faces", run: (dir) => blurFaces(png, dir), writesIntoDir: true },
  {
    wrapper: "remove-bg-anim",
    run: (dir) => removeBackgroundAnimated(png, dir, { inputExt: "png" }),
    writesIntoDir: true,
  },
];

describe("AI wrapper scratch ENOENT (#4217, #4612)", () => {
  for (const { wrapper, run, writesIntoDir } of WRAPPERS) {
    describe(wrapper, () => {
      if (writesIntoDir) {
        it("names the input write when the scratch dir is already gone", async () => {
          const err = await run(join(root, "vanished")).catch((e: unknown) => e);
          expect(isSafeMessageError(err)).toBe(true);
          expect(err).toMatchObject({
            kind: "operational",
            code: `ENOENT:${wrapper}:write-input`,
          });
          expect((err as Error).message).toMatch(/write-input .+\.\w+, scratch dir gone/);
          expect((err as Error).message).not.toContain(root);
          expect((err as { cause?: { code?: string } }).cause?.code).toBe("ENOENT");
          expect(runPythonWithProgress).not.toHaveBeenCalled();
        });
      }

      it("is operational when the scratch dir vanishes while the sidecar runs", async () => {
        const dir = join(root, "job");
        await mkdir(dir);
        runPythonWithProgress.mockImplementation(async () => {
          await rm(dir, { recursive: true, force: true });
          return { stdout: '{"success":true}', stderr: "" };
        });
        const err = await run(dir).catch((e: unknown) => e);
        expect(err).toMatchObject({
          isSafeMessage: true,
          kind: "operational",
          code: `ENOENT:${wrapper}:read-output`,
        });
        expect((err as Error).message).toContain("scratch dir gone");
        expect(classifyError(err, "worker")).toBe("operational");
        expect(extractErrorCode(err)).toBe(`ENOENT:${wrapper}:read-output`);
      });

      it("stays a bug when the sidecar reports success but wrote no output", async () => {
        const dir = join(root, "job");
        await mkdir(dir);
        const err = await run(dir).catch((e: unknown) => e);
        expect(err).toMatchObject({
          isSafeMessage: true,
          kind: "bug",
          code: `ENOENT:${wrapper}:read-output`,
        });
        expect((err as Error).message).toContain("scratch dir present");
        expect(classifyError(err, "worker")).toBe("bug");
      });
    });
  }
});

// These stage their input under tmpdir() and read no output file back.
const TMPDIR_WRITERS: Array<{ wrapper: string; run: () => Promise<unknown> }> = [
  { wrapper: "detect-faces", run: () => detectFaces(png) },
  { wrapper: "face-landmarks", run: () => detectFaceLandmarks(png) },
];

describe("tmpdir-staged wrappers scratch ENOENT (#4612)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const { wrapper, run } of TMPDIR_WRITERS) {
    it(`${wrapper} names the input write when tmpdir is gone`, async () => {
      // os.tmpdir() reads TMPDIR on every call, so this points the staging path at a missing dir.
      vi.stubEnv("TMPDIR", join(root, "vanished"));
      const err = await run().catch((e: unknown) => e);
      expect(isSafeMessageError(err)).toBe(true);
      expect(err).toMatchObject({ kind: "operational", code: `ENOENT:${wrapper}:write-input` });
      expect((err as Error).message).toContain("scratch dir gone");
      expect(extractErrorCode(err)).toBe(`ENOENT:${wrapper}:write-input`);
      expect(runPythonWithProgress).not.toHaveBeenCalled();
    });
  }
});

describe("remove-bg-anim cancel", () => {
  it("still reports a cancel rather than a scratch miss", async () => {
    const dir = join(root, "job");
    await mkdir(dir);
    parseStdoutJson.mockReturnValue({ success: false, error: "canceled" });
    runPythonWithProgress.mockImplementation(async () => {
      await rm(dir, { recursive: true, force: true });
      return { stdout: "{}", stderr: "" };
    });
    const err = await removeBackgroundAnimated(png, dir, { inputExt: "png" }).catch((e) => e);
    expect(err).toBeInstanceOf(AnimatedRemovalCanceledError);
  });
});

// seam-carve shells out to caire rather than a Python sidecar, so a fake caire stands in.
describe.skipIf(process.platform === "win32")("seam-carve scratch ENOENT (#4612)", () => {
  let caire: string;

  beforeEach(async () => {
    caire = join(root, "fake-caire.sh");
    // -help answers the probe; a real run writes nothing, or removes the scratch dir when a
    // <script>.vanish marker sits next to it.
    await writeFile(
      caire,
      [
        "#!/bin/sh",
        '[ "$1" = "-help" ] && exit 0',
        'out=""',
        'while [ $# -gt 0 ]; do [ "$1" = "-out" ] && out="$2"; shift; done',
        '[ -f "$0.vanish" ] && rm -rf "$(dirname "$out")"',
        "exit 0",
        "",
      ].join("\n"),
    );
    await chmod(caire, 0o755);
    vi.stubEnv("CAIRE_PATH", caire);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the input write when the scratch dir is already gone", async () => {
    const err = await seamCarve(png, join(root, "vanished"), { width: 3 }).catch((e) => e);
    expect(err).toMatchObject({
      isSafeMessage: true,
      kind: "operational",
      code: "ENOENT:seam-carve:write-input",
    });
    expect((err as Error).message).toMatch(/write-input caire-in-<id>\.jpg, scratch dir gone/);
  });

  it("is operational when the scratch dir vanishes while caire runs", async () => {
    const dir = join(root, "job");
    await mkdir(dir);
    await writeFile(`${caire}.vanish`, "");
    const err = await seamCarve(png, dir, { width: 3 }).catch((e) => e);
    expect(err).toMatchObject({ kind: "operational", code: "ENOENT:seam-carve:read-output" });
    expect(classifyError(err, "worker")).toBe("operational");
  });

  it("stays a bug when caire exits cleanly but wrote no output", async () => {
    const dir = join(root, "job");
    await mkdir(dir);
    const err = await seamCarve(png, dir, { width: 3 }).catch((e) => e);
    expect(err).toMatchObject({ kind: "bug", code: "ENOENT:seam-carve:read-output" });
    expect((err as Error).message).toContain("scratch dir present");
  });
});

describe("scratch-io helpers", () => {
  it("drops per-call UUIDs from the basename so the message stays low-cardinality", async () => {
    const path = join(root, "gone", "rembg_out_0f8fad5b-d9cb-469f-a165-70867728950e.png");
    const err = await readScratchOutput("remove-bg", path).catch((e: unknown) => e);
    expect((err as Error).message).toBe(
      "AI scratch file missing (read-output rembg_out_<id>.png, scratch dir gone)",
    );
  });

  it("groups the same step under one signature whatever the job path", async () => {
    const a = await readScratchOutput("upscale", join(root, "a", "out.png")).catch((e) => e);
    const b = await readScratchOutput("upscale", join(root, "b", "out.png")).catch((e) => e);
    expect(extractErrorCode(a)).toBe(extractErrorCode(b));
    expect((a as Error).message).toBe((b as Error).message);
    expect(errorSignature(a)).toBe(errorSignature(b));
  });

  it("passes non-ENOENT write faults through untouched", async () => {
    const file = join(root, "file");
    await writeFile(file, "x");
    // A path under a regular file fails with ENOTDIR, not ENOENT.
    const err = await writeScratchInput("upscale", join(file, "in.png"), png).catch((e) => e);
    expect(isSafeMessageError(err)).toBe(false);
    expect((err as { code?: string }).code).toBe("ENOTDIR");
  });

  it("passes non-ENOENT read faults through untouched", async () => {
    // Reading a directory fails with EISDIR.
    const err = await readScratchOutput("upscale", root).catch((e) => e);
    expect(isSafeMessageError(err)).toBe(false);
    expect((err as { code?: string }).code).toBe("EISDIR");
  });
});
