/**
 * Bundles whose x86-64 wheels need AVX are refused before any download on a
 * CPU without it, and the feature status says why (#4680).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import multipartPlugin from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  // feature-status reads DATA_DIR at import, so it is set before any import.
  const dataDir = `${process.env.TMPDIR ?? "/tmp"}/snapotter-cpu-gate-${process.pid}-${Date.now()}`;
  process.env.DATA_DIR = dataDir;
  return {
    dataDir,
    hostLacksAvx: vi.fn(() => false),
    reserveFeatureInstallStream: vi.fn(async () => {}),
  };
});

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

vi.mock("../../../apps/api/src/permissions.js", () => ({
  requirePermission: () => async () => ({ id: "admin-1", username: "admin", role: "admin" }),
}));

vi.mock("../../../apps/api/src/plugins/auth.js", () => ({
  requireAuth: () => ({ id: "admin-1", username: "admin", role: "admin" }),
}));

vi.mock("../../../apps/api/src/lib/cpu-features.js", () => ({
  hostLacksAvx: hoisted.hostLacksAvx,
}));

vi.mock("../../../apps/api/src/routes/progress.js", () => ({
  reserveFeatureInstallStream: hoisted.reserveFeatureInstallStream,
  releaseFeatureInstallStream: vi.fn(async () => {}),
  refreshFeatureInstallStream: vi.fn(async () => {}),
  updateSingleFileProgress: vi.fn(),
}));

vi.mock("@snapotter/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@snapotter/ai")>();
  return {
    ...actual,
    selectOcrRuntimeTarget: () => "linux-amd64-cpu-py312" as const,
    getOcrRuntimeEffectiveMemoryBytes: () => 8 * 1024 ** 3,
  };
});

import {
  getBundleHostUnsupportedReason,
  getModelsDir,
  isFeatureInstalled,
  markInstalled,
  markUninstalled,
} from "../../../apps/api/src/lib/feature-status.js";
import { type Manifest, registerFeatureRoutes } from "../../../apps/api/src/routes/features.js";

const manifest = (requiresAvx?: boolean): Manifest =>
  ({ bundles: { "face-detection": { models: [], requiresAvx } } }) as unknown as Manifest;

describe("getBundleHostUnsupportedReason", () => {
  beforeEach(() => hoisted.hostLacksAvx.mockReset());

  it("reports cpu-no-avx for an AVX bundle on a CPU without AVX", () => {
    hoisted.hostLacksAvx.mockReturnValue(true);
    expect(getBundleHostUnsupportedReason("face-detection", manifest(true))).toBe("cpu-no-avx");
  });

  it("allows an AVX bundle when the CPU has AVX or it can't be told", () => {
    hoisted.hostLacksAvx.mockReturnValue(false);
    expect(getBundleHostUnsupportedReason("face-detection", manifest(true))).toBeNull();
  });

  it("never blocks a bundle that doesn't need AVX, and never probes the CPU for it", () => {
    hoisted.hostLacksAvx.mockReturnValue(true);
    expect(getBundleHostUnsupportedReason("face-detection", manifest(false))).toBeNull();
    expect(getBundleHostUnsupportedReason("face-detection", manifest())).toBeNull();
    expect(getBundleHostUnsupportedReason("unknown-bundle", manifest(true))).toBeNull();
    expect(getBundleHostUnsupportedReason("face-detection", null)).toBeNull();
    expect(hoisted.hostLacksAvx).not.toHaveBeenCalled();
  });
});

describe("feature routes on a CPU without AVX (#4680)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    mkdirSync(join(hoisted.dataDir, "ai"), { recursive: true });
    app = Fastify({ logger: false });
    await app.register(multipartPlugin);
    await registerFeatureRoutes(app);
  });

  afterAll(async () => {
    await app.close();
    rmSync(hoisted.dataDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    hoisted.hostLacksAvx.mockReset();
    hoisted.hostLacksAvx.mockReturnValue(true);
    hoisted.reserveFeatureInstallStream.mockClear();
  });

  it("GET /api/v1/features marks the AVX bundles incompatible with the reason", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/features" });
    expect(res.statusCode, res.body).toBe(200);
    const bundles = res.json().bundles as Array<{
      id: string;
      compatibility?: string;
      compatibilityReason?: string | null;
    }>;
    const byId = new Map(bundles.map((b) => [b.id, b]));
    for (const id of ["face-detection", "photo-restoration"]) {
      expect(byId.get(id)).toMatchObject({
        compatibility: "incompatible",
        compatibilityReason: "cpu-no-avx",
      });
    }
    for (const id of ["background-removal", "upscale-enhance", "transcription"]) {
      expect(byId.get(id)?.compatibilityReason).toBeUndefined();
      expect(byId.get(id)?.compatibility).toBeUndefined();
    }
    expect(byId.get("ocr")?.compatibilityReason).not.toBe("cpu-no-avx");
  });

  it("GET /api/v1/features reports nothing unusual when the CPU has AVX", async () => {
    hoisted.hostLacksAvx.mockReturnValue(false);
    const res = await app.inject({ method: "GET", url: "/api/v1/features" });
    const face = (res.json().bundles as Array<{ id: string; compatibility?: string }>).find(
      (b) => b.id === "face-detection",
    );
    expect(face?.compatibility).toBeUndefined();
  });

  it("refuses the bundle install with FEATURE_CPU_UNSUPPORTED before reserving anything", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/face-detection/install",
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({
      code: "FEATURE_CPU_UNSUPPORTED",
      feature: "face-detection",
      reason: "cpu-no-avx",
    });
    expect(res.json().error).toMatch(/AVX/);
    expect(hoisted.reserveFeatureInstallStream).not.toHaveBeenCalled();
  });

  it("refuses a tool install that needs an AVX bundle without queueing its other bundles", async () => {
    // passport-photo needs face-detection (AVX) and background-removal (not).
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/tools/passport-photo/features/install",
    });
    expect(res.statusCode, res.body).toBe(409);
    expect(res.json()).toMatchObject({
      code: "FEATURE_CPU_UNSUPPORTED",
      feature: "face-detection",
    });
    expect(hoisted.reserveFeatureInstallStream).not.toHaveBeenCalled();
  });

  it("still reaches the install queue for a bundle that doesn't need AVX", async () => {
    hoisted.reserveFeatureInstallStream.mockRejectedValueOnce(new Error("stop here"));
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/features/background-removal/install",
    });
    expect(res.statusCode).not.toBe(409);
    expect(hoisted.reserveFeatureInstallStream).toHaveBeenCalledTimes(1);
  });

  describe("a face-detection install from before the gate", () => {
    // face-detection's two models, at their manifest minimum sizes.
    const models = [
      ["mediapipe/blaze_face_short_range.tflite", 100_000],
      ["mediapipe/face_landmarker.task", 1_000_000],
    ] as const;

    function writeModels() {
      for (const [path, size] of models) {
        const full = join(getModelsDir(), path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, "");
        truncateSync(full, size);
      }
    }

    beforeEach(() => {
      rmSync(getModelsDir(), { recursive: true, force: true });
      markInstalled("face-detection", "test", []);
    });

    afterEach(() => {
      markUninstalled("face-detection");
      rmSync(getModelsDir(), { recursive: true, force: true });
    });

    it("keeps the already-installed answer when it is healthy", async () => {
      writeModels();
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/face-detection/install",
      });
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json().code).not.toBe("FEATURE_CPU_UNSUPPORTED");
      expect(res.json().error).toMatch(/already installed/);
    });

    it("lets a tool install skip it and go on to the bundle that can install", async () => {
      writeModels();
      hoisted.reserveFeatureInstallStream.mockRejectedValueOnce(new Error("stop here"));
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/tools/passport-photo/features/install",
      });
      expect(res.json().code).not.toBe("FEATURE_CPU_UNSUPPORTED");
      expect(hoisted.reserveFeatureInstallStream).toHaveBeenCalledTimes(1);
      expect(hoisted.reserveFeatureInstallStream).toHaveBeenCalledWith(
        expect.objectContaining({ bundleId: "background-removal" }),
      );
    });

    it("refuses it when its models are missing, since that install would download again", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/face-detection/install",
      });
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json().code).toBe("FEATURE_CPU_UNSUPPORTED");
      expect(hoisted.reserveFeatureInstallStream).not.toHaveBeenCalled();
    });
  });

  describe("offline import of a legacy bundle (#4724)", () => {
    async function legacyArchive(bundleId: string): Promise<Buffer> {
      const src = join(hoisted.dataDir, `archive-src-${bundleId}`);
      rmSync(src, { recursive: true, force: true });
      mkdirSync(join(src, "models"), { recursive: true });
      writeFileSync(
        join(src, "bundle.json"),
        JSON.stringify({ bundleId, version: "test", models: [] }),
      );
      const out = join(hoisted.dataDir, `${bundleId}.tar.gz`);
      execFileSync("tar", ["-czf", out, "-C", src, "bundle.json", "models"]);
      return readFileSync(out);
    }

    function multipart(content: Buffer) {
      const boundary = "----SnapOtterCpuGate4724";
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bundle.tar.gz"\r\nContent-Type: application/gzip\r\n\r\n`,
        ),
        content,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return { body, contentType: `multipart/form-data; boundary=${boundary}` };
    }

    afterEach(() => markUninstalled("face-detection"));

    it("refuses an AVX bundle with FEATURE_CPU_UNSUPPORTED and leaves it uninstalled", async () => {
      const { body, contentType } = multipart(await legacyArchive("face-detection"));
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/import",
        headers: { "content-type": contentType },
        payload: body,
      });
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json()).toMatchObject({
        code: "FEATURE_CPU_UNSUPPORTED",
        feature: "face-detection",
        reason: "cpu-no-avx",
      });
      expect(isFeatureInstalled("face-detection")).toBe(false);
      // The refused archive's staging directory is gone too.
      expect(
        readdirSync(join(hoisted.dataDir, "ai")).filter((n) => n.startsWith("import-")),
      ).toEqual([]);
    });

    it("doesn't refuse it when the CPU has AVX", async () => {
      hoisted.hostLacksAvx.mockReturnValue(false);
      const { body, contentType } = multipart(await legacyArchive("face-detection"));
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/admin/features/import",
        headers: { "content-type": contentType },
        payload: body,
      });
      expect(res.json().code).not.toBe("FEATURE_CPU_UNSUPPORTED");
    });
  });
});
