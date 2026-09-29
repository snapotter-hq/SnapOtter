import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { APP_VERSION } from "@snapotter/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OcrRuntimeTrustKey } from "../../../packages/ai/src/runtime-index.js";
import {
  getOcrRuntimeCapability,
  readActiveRuntime,
  readCommittedOcrRuntimeActivationIdentity,
  readPendingOcrRuntimeForHandoff,
  resolveAiDataDir,
  selectOcrRuntimeTarget,
} from "../../../packages/ai/src/runtime-state.js";

// runtime-state rejects any runtime whose compatibility.snapotterVersion is not
// exactly APP_VERSION, so these fixtures must track the real version. A literal
// here passes only until the next release bump, then fails every assertion that
// resolves a runtime. That is what happened on 2.1.0 -> 2.2.0.

const temporaryDirectories: string[] = [];
const runtimeSigningKey = generateKeyPairSync("ed25519");

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value))}\n`;
}

interface MutableDescriptor {
  schemaVersion: unknown;
  family: unknown;
  generation: unknown;
  status: unknown;
  activatedAt: unknown;
  artifact: Record<string, unknown>;
  runtime: Record<string, unknown>;
  compatibility: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  health: Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("resolveAiDataDir", () => {
  it("keeps DATA_DIR authoritative over the verifier-only AI_DATA_DIR seam", () => {
    const dataDir = join(tmpdir(), "snapotter-data-root");
    vi.stubEnv("DATA_DIR", dataDir);
    vi.stubEnv("AI_DATA_DIR", join(tmpdir(), "snapotter-verifier-ai-root"));

    expect(resolveAiDataDir()).toBe(join(dataDir, "ai"));
  });
});

function createRuntimeFixture(): {
  aiDataDir: string;
  activationPath: string;
  descriptorPath: string;
  runtimeRoot: string;
  pythonPath: string;
  entrypoint: string;
  adapterPath: string;
  smallModelPath: string;
  mediumModelPath: string;
  sitePackagePath: string;
  signedIndexPath: string;
} {
  const aiDataDir = mkdtempSync(join(tmpdir(), "snapotter-runtime-state-"));
  temporaryDirectories.push(aiDataDir);

  const v3Root = join(aiDataDir, "v3");
  const runtimeRoot = join(v3Root, "runtimes", "ocr", "linux-amd64-cpu-py312", "generation-test");
  const pythonPath = join(runtimeRoot, "venv", "bin", "python");
  const entrypoint = join(runtimeRoot, "ocr_runner.py");
  const adapterPath = join(runtimeRoot, "ocr_runtime.py");
  const smallModelPath = join(runtimeRoot, "models", "small.onnx");
  const mediumModelPath = join(runtimeRoot, "models", "medium.onnx");
  const sitePackagePath = join(
    runtimeRoot,
    "venv",
    "lib",
    "python3.12",
    "site-packages",
    "rapidocr",
    "__init__.py",
  );
  const descriptorPath = join(v3Root, "active", "ocr.json");

  mkdirSync(join(runtimeRoot, "venv", "bin"), { recursive: true });
  mkdirSync(join(runtimeRoot, "models"), { recursive: true });
  mkdirSync(join(sitePackagePath, ".."), { recursive: true });
  mkdirSync(join(v3Root, "active"), { recursive: true });
  writeFileSync(pythonPath, "#!/bin/sh\n", "utf-8");
  writeFileSync(entrypoint, "# test entrypoint\n", "utf-8");
  writeFileSync(adapterPath, "# test adapter\n", "utf-8");
  writeFileSync(smallModelPath, "small", "utf-8");
  writeFileSync(mediumModelPath, "medium", "utf-8");
  writeFileSync(sitePackagePath, "rapidocr-v1\n", "utf-8");
  chmodSync(pythonPath, 0o755);

  const files = [
    ["venv/bin/python", "#!/bin/sh\n", 0o755],
    ["ocr_runner.py", "# test entrypoint\n", 0o644],
    ["ocr_runtime.py", "# test adapter\n", 0o644],
    ["models/small.onnx", "small", 0o644],
    ["models/medium.onnx", "medium", 0o644],
    ["venv/lib/python3.12/site-packages/rapidocr/__init__.py", "rapidocr-v1\n", 0o644],
  ].map(([path, contents, mode]) => ({
    path,
    sha256: createHash("sha256")
      .update(contents as string)
      .digest("hex"),
    size: Buffer.byteLength(contents as string),
    mode,
  }));
  const artifact = {
    family: "ocr",
    target: "linux-amd64-cpu-py312",
    generation: "generation-test",
    version: APP_VERSION,
    platform: "linux",
    arch: "amd64",
    archive: {
      file: "ocr-linux-amd64-cpu-py312.tar.gz",
      sha256: "a".repeat(64),
      size: 123,
      expandedSize: files.reduce((total, file) => total + file.size, 0),
    },
    files,
    runtime: {
      pythonPath: "venv/bin/python",
      entrypoint: "ocr_runner.py",
      adapterPath: "ocr_runtime.py",
    },
    models: {
      "pp-ocrv6-small": createHash("sha256").update("small").digest("hex"),
      "pp-ocrv6-medium": createHash("sha256").update("medium").digest("hex"),
    },
    compatibility: { protocolVersion: 1, snapotterVersion: APP_VERSION },
    capabilities: {
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
    },
    resources: { minimumMemoryBytes: 4 * 1024 ** 3 },
  };
  const unsignedIndex = { schemaVersion: 1, artifacts: [artifact] };
  const signedIndex = {
    ...unsignedIndex,
    signature: {
      keyId: "runtime-state-test-key",
      algorithm: "ed25519",
      value: sign(
        null,
        Buffer.from(canonicalJson(unsignedIndex)),
        runtimeSigningKey.privateKey,
      ).toString("base64"),
    },
  };
  const signedIndexBytes = canonicalJson(signedIndex);
  const signedIndexSha256 = createHash("sha256").update(signedIndexBytes).digest("hex");
  const signedIndexPath = join(v3Root, "indexes", `${signedIndexSha256}.json`);
  mkdirSync(join(v3Root, "indexes"), { recursive: true });
  writeFileSync(signedIndexPath, signedIndexBytes, "utf-8");
  vi.stubEnv("OCR_RUNTIME_INDEX_KEY_ID", "runtime-state-test-key");
  vi.stubEnv(
    "OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64",
    Buffer.from(runtimeSigningKey.publicKey.export({ type: "spki", format: "pem" })).toString(
      "base64",
    ),
  );

  const descriptorBytes = JSON.stringify({
    schemaVersion: 1,
    family: "ocr",
    generation: "generation-test",
    status: "ready",
    activatedAt: "2026-07-13T00:00:00.000Z",
    artifact: {
      version: APP_VERSION,
      target: "linux-amd64-cpu-py312",
      platform: "linux",
      arch: "amd64",
      sha256: "a".repeat(64),
      models: {
        "pp-ocrv6-small": createHash("sha256").update("small").digest("hex"),
        "pp-ocrv6-medium": createHash("sha256").update("medium").digest("hex"),
      },
      modelFiles: {
        "pp-ocrv6-small": {
          path: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/models/small.onnx",
          sha256: createHash("sha256").update("small").digest("hex"),
          size: 5,
        },
        "pp-ocrv6-medium": {
          path: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/models/medium.onnx",
          sha256: createHash("sha256").update("medium").digest("hex"),
          size: 6,
        },
      },
      signedIndex: {
        path: `indexes/${signedIndexSha256}.json`,
        sha256: signedIndexSha256,
        size: Buffer.byteLength(signedIndexBytes),
      },
    },
    runtime: {
      pythonPath: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/venv/bin/python",
      entrypoint: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/ocr_runner.py",
      integrityFiles: {
        python: {
          path: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/venv/bin/python",
          sha256: createHash("sha256").update("#!/bin/sh\n").digest("hex"),
          size: 10,
        },
        entrypoint: {
          path: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/ocr_runner.py",
          sha256: createHash("sha256").update("# test entrypoint\n").digest("hex"),
          size: 18,
        },
        adapter: {
          path: "runtimes/ocr/linux-amd64-cpu-py312/generation-test/ocr_runtime.py",
          sha256: createHash("sha256").update("# test adapter\n").digest("hex"),
          size: 15,
        },
      },
    },
    compatibility: {
      protocolVersion: 1,
      snapotterVersion: APP_VERSION,
    },
    capabilities: {
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
    },
    health: {
      status: "healthy",
      checkedAt: "2026-07-13T00:00:01.000Z",
    },
  });
  writeFileSync(descriptorPath, descriptorBytes, "utf-8");
  const activationPath = join(v3Root, "rollback", "ocr.json");
  mkdirSync(join(v3Root, "rollback"), { recursive: true });
  writeFileSync(
    activationPath,
    canonicalJson({
      schemaVersion: 1,
      family: "ocr",
      status: "committed",
      activatedGeneration: "generation-test",
      activatedDescriptorSha256: createHash("sha256").update(descriptorBytes).digest("hex"),
      previousDescriptorB64: null,
      previousGeneration: null,
      previousIndexPath: null,
    }),
    "utf-8",
  );

  return {
    aiDataDir,
    activationPath,
    descriptorPath,
    runtimeRoot,
    pythonPath,
    entrypoint,
    adapterPath,
    smallModelPath,
    mediumModelPath,
    sitePackagePath,
    signedIndexPath,
  };
}

function mutateDescriptor(
  descriptorPath: string,
  mutate: (descriptor: MutableDescriptor) => void,
): void {
  const descriptor = JSON.parse(readFileSync(descriptorPath, "utf-8")) as MutableDescriptor;
  mutate(descriptor);
  const descriptorBytes = JSON.stringify(descriptor);
  writeFileSync(descriptorPath, descriptorBytes, "utf-8");
  const activationPath = join(dirname(dirname(descriptorPath)), "rollback", "ocr.json");
  const activation = JSON.parse(readFileSync(activationPath, "utf-8")) as Record<string, unknown>;
  activation.activatedDescriptorSha256 = createHash("sha256").update(descriptorBytes).digest("hex");
  writeFileSync(activationPath, canonicalJson(activation), "utf-8");
}

function mutateActivationState(
  activationPath: string,
  mutate: (state: Record<string, unknown>) => void,
): void {
  const state = JSON.parse(readFileSync(activationPath, "utf-8")) as Record<string, unknown>;
  mutate(state);
  writeFileSync(activationPath, canonicalJson(state), "utf-8");
}

const invalidDescriptorCases: Array<[string, (descriptor: MutableDescriptor) => void]> = [
  ["schema version", (descriptor) => (descriptor.schemaVersion = 2)],
  ["family", (descriptor) => (descriptor.family = "speech")],
  ["generation", (descriptor) => (descriptor.generation = "")],
  ["activation status", (descriptor) => (descriptor.status = "staging")],
  ["activation timestamp", (descriptor) => (descriptor.activatedAt = "soon")],
  ["artifact version", (descriptor) => (descriptor.artifact.version = "")],
  ["artifact digest", (descriptor) => (descriptor.artifact.sha256 = "abc")],
  ["signed index", (descriptor) => (descriptor.artifact.signedIndex = {})],
  ["artifact target", (descriptor) => (descriptor.artifact.target = "linux-amd64-gpu")],
  ["model digests", (descriptor) => (descriptor.artifact.models = {})],
  ["model files", (descriptor) => (descriptor.artifact.modelFiles = {})],
  ["runtime integrity files", (descriptor) => (descriptor.runtime.integrityFiles = {})],
  [
    "model file location",
    (descriptor) => {
      const files = descriptor.artifact.modelFiles as Record<string, Record<string, unknown>>;
      files["pp-ocrv6-small"].path =
        "runtimes/ocr/linux-amd64-cpu-py312/generation-test/ocr_runner.py";
    },
  ],
  ["protocol version", (descriptor) => (descriptor.compatibility.protocolVersion = 2)],
  ["SnapOtter version", (descriptor) => (descriptor.compatibility.snapotterVersion = "1.0.0")],
  ["health status", (descriptor) => (descriptor.health.status = "degraded")],
  ["health timestamp", (descriptor) => (descriptor.health.checkedAt = "never")],
  ["qualities", (descriptor) => (descriptor.capabilities.qualities = ["best"])],
  ["providers", (descriptor) => (descriptor.capabilities.providers = [])],
];

describe("selectOcrRuntimeTarget", () => {
  it("selects the Python 3.12 CPU artifact for Linux AMD64", () => {
    expect(selectOcrRuntimeTarget({ platform: "linux", arch: "x64" })).toBe(
      "linux-amd64-cpu-py312",
    );
  });

  it("selects the Python 3.11 CPU artifact for Linux ARM64", () => {
    expect(selectOcrRuntimeTarget({ platform: "linux", arch: "arm64" })).toBe(
      "linux-arm64-cpu-py311",
    );
  });

  it("fails closed on unsupported platforms and architectures", () => {
    expect(selectOcrRuntimeTarget({ platform: "darwin", arch: "arm64" })).toBeNull();
    expect(selectOcrRuntimeTarget({ platform: "linux", arch: "ia32" })).toBeNull();
  });

  it("rejects accurate runtimes outside the official container ABI", () => {
    expect(
      selectOcrRuntimeTarget({
        platform: "linux",
        arch: "x64",
        officialContainer: false,
      }),
    ).toBeNull();
  });
});

describe("readActiveRuntime", () => {
  it("returns a healthy compatible descriptor with contained absolute runtime paths", () => {
    const fixture = createRuntimeFixture();

    const descriptor = readActiveRuntime("ocr", {
      aiDataDir: fixture.aiDataDir,
      platform: "linux",
      arch: "x64",
    });

    expect(descriptor).toMatchObject({
      schemaVersion: 1,
      family: "ocr",
      generation: "generation-test",
      status: "ready",
      artifact: {
        target: "linux-amd64-cpu-py312",
        platform: "linux",
        arch: "amd64",
        models: {
          "pp-ocrv6-small": createHash("sha256").update("small").digest("hex"),
          "pp-ocrv6-medium": createHash("sha256").update("medium").digest("hex"),
        },
      },
      compatibility: {
        protocolVersion: 1,
        snapotterVersion: APP_VERSION,
      },
      runtime: {
        root: fixture.runtimeRoot,
        pythonPath: fixture.pythonPath,
        entrypoint: fixture.entrypoint,
        integrityFiles: expect.any(Object),
      },
      capabilities: {
        qualities: ["balanced", "best"],
        providers: ["CPUExecutionProvider"],
      },
      health: { status: "healthy" },
    });
  });

  it("routes only committed state while installer handoff can inspect exact pending state", () => {
    const fixture = createRuntimeFixture();
    const options = {
      aiDataDir: fixture.aiDataDir,
      platform: "linux" as const,
      arch: "x64" as const,
    };
    mutateActivationState(fixture.activationPath, (state) => {
      state.status = "pending";
    });

    expect(readActiveRuntime("ocr", options)).toBeNull();
    expect(readPendingOcrRuntimeForHandoff(options)).toMatchObject({
      generation: "generation-test",
    });
  });

  it("accepts a committed upgrade marker with a structurally valid previous descriptor", () => {
    const fixture = createRuntimeFixture();
    const previous = JSON.parse(readFileSync(fixture.descriptorPath, "utf-8"));
    previous.generation = "generation-previous";
    const previousBytes = canonicalJson(previous);
    mutateActivationState(fixture.activationPath, (state) => {
      state.previousDescriptorB64 = Buffer.from(previousBytes).toString("base64");
      state.previousGeneration = "generation-previous";
      state.previousIndexPath = previous.artifact.signedIndex.path;
    });

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toMatchObject({ generation: "generation-test" });
  });

  it("fails closed for missing, corrupt, symlinked, or descriptor-mismatched activation state", () => {
    const fixtures = Array.from({ length: 4 }, () => createRuntimeFixture());
    const options = (aiDataDir: string) => ({
      aiDataDir,
      platform: "linux" as const,
      arch: "x64" as const,
    });

    unlinkSync(fixtures[0].activationPath);
    writeFileSync(fixtures[1].activationPath, "{{not-json", "utf-8");
    const external = join(fixtures[2].aiDataDir, "external-activation.json");
    writeFileSync(external, readFileSync(fixtures[2].activationPath));
    unlinkSync(fixtures[2].activationPath);
    symlinkSync(external, fixtures[2].activationPath);
    mutateActivationState(fixtures[3].activationPath, (state) => {
      state.activatedDescriptorSha256 = "f".repeat(64);
    });

    for (const fixture of fixtures) {
      expect(readActiveRuntime("ocr", options(fixture.aiDataDir))).toBeNull();
      expect(readPendingOcrRuntimeForHandoff(options(fixture.aiDataDir))).toBeNull();
      expect(getOcrRuntimeCapability(options(fixture.aiDataDir))).toMatchObject({
        available: false,
        status: "invalid",
        reason: "descriptor-invalid",
      });
    }
  });

  it("rejects a structurally corrupt activation record even when its active hash matches", () => {
    const fixture = createRuntimeFixture();
    mutateActivationState(fixture.activationPath, (state) => {
      state.previousDescriptorB64 = "not-base64***";
    });

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it.each(invalidDescriptorCases)("fails closed for an invalid %s", (_name, mutate) => {
    const fixture = createRuntimeFixture();
    mutateDescriptor(fixture.descriptorPath, mutate);

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("fails closed when the artifact is incompatible with the current host", () => {
    const fixture = createRuntimeFixture();

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "arm64",
      }),
    ).toBeNull();
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "darwin",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rejects absolute paths and traversal even when they point to files", () => {
    const fixture = createRuntimeFixture();
    const outsidePath = join(fixture.aiDataDir, "outside-python");
    writeFileSync(outsidePath, "#!/bin/sh\n", "utf-8");

    mutateDescriptor(fixture.descriptorPath, (descriptor) => {
      descriptor.runtime.pythonPath = outsidePath;
    });
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();

    mutateDescriptor(fixture.descriptorPath, (descriptor) => {
      descriptor.runtime.pythonPath = "../outside-python";
    });
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rejects missing files and symlinks in runtime paths", () => {
    const fixture = createRuntimeFixture();
    unlinkSync(fixture.pythonPath);
    symlinkSync(fixture.entrypoint, fixture.pythonPath);

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();

    unlinkSync(fixture.pythonPath);
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rejects missing, resized, and symlinked model files", () => {
    const missing = createRuntimeFixture();
    unlinkSync(missing.smallModelPath);
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: missing.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();

    const resized = createRuntimeFixture();
    writeFileSync(resized.mediumModelPath, "changed", "utf-8");
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: resized.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();

    const symlinked = createRuntimeFixture();
    unlinkSync(symlinked.smallModelPath);
    symlinkSync(symlinked.mediumModelPath, symlinked.smallModelPath);
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: symlinked.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rejects same-size model and execution-code corruption", () => {
    const model = createRuntimeFixture();
    writeFileSync(model.smallModelPath, "wrong", "utf-8");
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: model.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();

    const adapter = createRuntimeFixture();
    writeFileSync(adapter.adapterPath, "# evil adapter\n", "utf-8");
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: adapter.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rechecks filesystem identity and rejects same-size site-packages corruption", () => {
    const fixture = createRuntimeFixture();
    const options = {
      aiDataDir: fixture.aiDataDir,
      platform: "linux" as const,
      arch: "x64" as const,
    };

    expect(readActiveRuntime("ocr", options)).not.toBeNull();
    writeFileSync(fixture.sitePackagePath, "rapidocr-v2\n", "utf-8");

    expect(readActiveRuntime("ocr", options)).toBeNull();
  });

  it("rejects payload metadata that no longer matches its trusted signed index", () => {
    const fixture = createRuntimeFixture();
    const index = JSON.parse(readFileSync(fixture.signedIndexPath, "utf-8"));
    index.artifacts[0].files.at(-1).sha256 = "f".repeat(64);
    writeFileSync(fixture.signedIndexPath, canonicalJson(index), "utf-8");

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("ignores missing, corrupt, non-canonical, and legacy state", () => {
    const fixture = createRuntimeFixture();
    const activeDir = join(fixture.aiDataDir, "v3", "active");
    const aiDataDir = fixture.aiDataDir;
    const options = { aiDataDir, platform: "linux" as const, arch: "x64" as const };
    const validJson = readFileSync(fixture.descriptorPath, "utf-8");

    unlinkSync(fixture.descriptorPath);
    writeFileSync(join(aiDataDir, "installed.json"), validJson, "utf-8");
    writeFileSync(join(activeDir, "ocr-onnx.json"), validJson, "utf-8");
    expect(readActiveRuntime("ocr", options)).toBeNull();

    writeFileSync(fixture.descriptorPath, "{{not-json", "utf-8");
    expect(readActiveRuntime("ocr", options)).toBeNull();
  });

  it("rejects a caller-controlled family path", () => {
    const fixture = createRuntimeFixture();
    const nonCanonicalPath = join(fixture.aiDataDir, "v3", "other.json");
    writeFileSync(nonCanonicalPath, readFileSync(fixture.descriptorPath, "utf-8"), "utf-8");

    expect(
      readActiveRuntime("../other" as "ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("rejects a symlinked active directory", () => {
    const fixture = createRuntimeFixture();
    const activeDir = join(fixture.aiDataDir, "v3", "active");
    const externalActiveDir = join(fixture.aiDataDir, "external-active");
    const descriptorJson = readFileSync(fixture.descriptorPath, "utf-8");

    rmSync(activeDir, { recursive: true });
    mkdirSync(externalActiveDir);
    writeFileSync(join(externalActiveDir, "ocr.json"), descriptorJson, "utf-8");
    symlinkSync(externalActiveDir, activeDir, "dir");

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });

  it("resolves the AI root from AI_DATA_DIR", () => {
    const fixture = createRuntimeFixture();
    vi.stubEnv("DATA_DIR", "");
    vi.stubEnv("AI_DATA_DIR", fixture.aiDataDir);

    expect(readActiveRuntime("ocr", { platform: "linux", arch: "x64" })).not.toBeNull();
  });

  it("revalidates active payloads with an operator-supplied trust store", () => {
    const fixture = createRuntimeFixture();
    const trustStorePath = join(fixture.aiDataDir, "ocr-runtime-trust.json");
    writeFileSync(
      trustStorePath,
      JSON.stringify({
        schemaVersion: 1,
        keys: [
          {
            keyId: "runtime-state-test-key",
            algorithm: "ed25519",
            publicKey: runtimeSigningKey.publicKey.export({ type: "spki", format: "pem" }),
          },
        ],
      }),
      "utf-8",
    );
    vi.stubEnv("OCR_RUNTIME_INDEX_KEY_ID", "");
    vi.stubEnv("OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64", "");
    vi.stubEnv("SNAPOTTER_OCR_RUNTIME_TRUST_STORE", trustStorePath);

    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).not.toBeNull();
  });
});

describe("getOcrRuntimeCapability", () => {
  it("reports only validated active runtime capabilities", () => {
    const fixture = createRuntimeFixture();

    const capability = getOcrRuntimeCapability({
      aiDataDir: fixture.aiDataDir,
      platform: "linux",
      arch: "x64",
    });

    expect(capability).toMatchObject({
      available: true,
      status: "ready",
      qualities: ["balanced", "best"],
      providers: ["CPUExecutionProvider"],
      descriptor: { family: "ocr", generation: "generation-test" },
    });
  });

  it("returns empty capabilities when runtime state is unavailable", () => {
    const aiDataDir = mkdtempSync(join(tmpdir(), "snapotter-runtime-state-empty-"));
    temporaryDirectories.push(aiDataDir);

    expect(getOcrRuntimeCapability({ aiDataDir, platform: "linux", arch: "x64" })).toEqual({
      available: false,
      status: "missing",
      reason: "descriptor-missing",
      qualities: [],
      providers: [],
    });
  });

  it("fails accurate-runtime admission closed when the effective memory limit drops", () => {
    const fixture = createRuntimeFixture();

    expect(
      getOcrRuntimeCapability({
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
        effectiveMemoryBytes: 4 * 1024 ** 3 - 1,
      }),
    ).toMatchObject({
      available: false,
      status: "incompatible",
      reason: "insufficient-memory",
    });
  });

  it("reports an unreadable identified memory controller as incompatible", () => {
    const fixture = createRuntimeFixture();
    const procFiles = new Map([
      ["/proc/self/cgroup", "0::/docker/deadbeef\n"],
      [
        "/proc/self/mountinfo",
        "29 23 0:26 / /sys/fs/cgroup rw,nosuid,nodev,noexec,relatime - cgroup2 cgroup rw\n",
      ],
    ]);

    expect(
      getOcrRuntimeCapability({
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
        physicalMemoryBytes: 8 * 1024 ** 3,
        readTextFile: (path) => {
          const value = procFiles.get(path);
          if (value === undefined) throw new Error("denied");
          return value;
        },
      }),
    ).toMatchObject({
      available: false,
      status: "incompatible",
      reason: "memory-capacity-unknown",
    });
  });

  it("distinguishes incompatible, invalid, and unsupported runtime state", () => {
    const incompatible = createRuntimeFixture();
    expect(
      getOcrRuntimeCapability({
        aiDataDir: incompatible.aiDataDir,
        platform: "linux",
        arch: "arm64",
      }),
    ).toMatchObject({
      available: false,
      status: "incompatible",
      reason: "artifact-incompatible",
    });

    const invalid = createRuntimeFixture();
    mutateDescriptor(invalid.descriptorPath, (descriptor) => {
      descriptor.artifact.arch = null;
    });
    expect(
      getOcrRuntimeCapability({
        aiDataDir: invalid.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toMatchObject({
      available: false,
      status: "invalid",
      reason: "descriptor-invalid",
    });

    expect(
      getOcrRuntimeCapability({
        aiDataDir: incompatible.aiDataDir,
        platform: "darwin",
        arch: "arm64",
      }),
    ).toMatchObject({
      available: false,
      status: "incompatible",
      reason: "unsupported-host",
    });
  });
});

describe("invalid runtime diagnostics (#1433)", () => {
  const linuxX64 = { platform: "linux", arch: "x64" } as const;
  type Fixture = ReturnType<typeof createRuntimeFixture>;

  function warnings(warn: ReturnType<typeof vi.spyOn>): string[] {
    return warn.mock.calls.map((call) => String(call[0]));
  }

  function quietWarn() {
    return vi.spyOn(console, "warn").mockImplementation(() => {});
  }

  it("logs which check rejected the runtime, once, without putting it on the capability", () => {
    const fixture = createRuntimeFixture();
    writeFileSync(fixture.smallModelPath, "wrong", "utf-8");
    const warn = quietWarn();
    const options = { aiDataDir: fixture.aiDataDir, ...linuxX64 };

    // Per-request reads stay quiet; only the capability check reports.
    expect(readActiveRuntime("ocr", options)).toBeNull();
    expect(warn).not.toHaveBeenCalled();

    const capability = getOcrRuntimeCapability(options);
    expect(capability).toEqual({
      available: false,
      status: "invalid",
      reason: "descriptor-invalid",
      qualities: [],
      providers: [],
    });
    expect(warnings(warn)).toEqual([
      `[ocr-runtime] Accurate OCR runtime at ${join(fixture.aiDataDir, "v3")} is unavailable: model file runtimes/ocr/linux-amd64-cpu-py312/generation-test/models/small.onnx is hard-linked or failed its digest check`,
    ]);

    // The capability is polled; the same failure must not flood the log.
    getOcrRuntimeCapability(options);
    getOcrRuntimeCapability(options);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("logs a different failure on the same runtime right away", () => {
    const fixture = createRuntimeFixture();
    const options = { aiDataDir: fixture.aiDataDir, ...linuxX64 };
    const warn = quietWarn();

    writeFileSync(fixture.smallModelPath, "broken", "utf-8");
    getOcrRuntimeCapability(options);
    // Put the model back so only one thing is wrong at a time.
    writeFileSync(fixture.smallModelPath, "small", "utf-8");
    writeFileSync(fixture.adapterPath, "# evil adapter\n", "utf-8");
    getOcrRuntimeCapability(options);

    expect(warnings(warn)).toEqual([
      expect.stringMatching(/small\.onnx is the wrong size$/),
      expect.stringMatching(/ocr_runtime\.py is hard-linked or doesn't match its size or digest$/),
    ]);
  });

  it("logs again after the runtime recovers and then fails", () => {
    const fixture = createRuntimeFixture();
    const options = { aiDataDir: fixture.aiDataDir, ...linuxX64 };
    const warn = quietWarn();

    // A different length from "small", so the size check catches it without
    // depending on the digest cache seeing a same-size rewrite.
    writeFileSync(fixture.smallModelPath, "broken", "utf-8");
    getOcrRuntimeCapability(options);
    writeFileSync(fixture.smallModelPath, "small", "utf-8");
    expect(getOcrRuntimeCapability(options).available).toBe(true);
    writeFileSync(fixture.smallModelPath, "broken", "utf-8");
    getOcrRuntimeCapability(options);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("stays quiet for missing, incompatible, and unsupported-host runtimes", () => {
    const warn = quietWarn();
    const empty = mkdtempSync(join(tmpdir(), "snapotter-runtime-state-empty-"));
    temporaryDirectories.push(empty);
    const fixture = createRuntimeFixture();

    expect(getOcrRuntimeCapability({ aiDataDir: empty, ...linuxX64 })).toMatchObject({
      reason: "descriptor-missing",
    });
    expect(
      getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, platform: "linux", arch: "arm64" }),
    ).toMatchObject({ reason: "artifact-incompatible" });
    expect(
      getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, platform: "darwin", arch: "arm64" }),
    ).toMatchObject({ reason: "unsupported-host" });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["after the descriptor swap", (_state: Record<string, unknown>) => {}],
    [
      // The installer writes the pending marker for the new descriptor before
      // it swaps the descriptor in.
      "before the descriptor swap",
      (state: Record<string, unknown>) => {
        state.activatedDescriptorSha256 = "e".repeat(64);
      },
    ],
  ])("words a pending activation as an install in flight, %s", (_label, adjust) => {
    const fixture = createRuntimeFixture();
    mutateActivationState(fixture.activationPath, (state) => {
      state.status = "pending";
      adjust(state);
    });
    const warn = quietWarn();
    const options = { aiDataDir: fixture.aiDataDir, ...linuxX64 };

    expect(getOcrRuntimeCapability(options)).toMatchObject({ reason: "descriptor-invalid" });
    getOcrRuntimeCapability(options);
    expect(warnings(warn)).toEqual([
      expect.stringMatching(
        /is unavailable: activation marker rollback\/ocr\.json is still pending commit \(an install is running or was interrupted\)$/,
      ),
    ]);
  });

  it.each<[string, (fixture: Fixture) => void, RegExp]>([
    [
      "missing signed index",
      (fixture) => unlinkSync(fixture.signedIndexPath),
      /signed index indexes\/.* is missing, outside indexes\/, or behind a symlink$/,
    ],
    [
      "tampered signed index",
      (fixture) => {
        const index = JSON.parse(readFileSync(fixture.signedIndexPath, "utf-8"));
        index.artifacts[0].files.at(-1).sha256 = "f".repeat(64);
        writeFileSync(fixture.signedIndexPath, canonicalJson(index), "utf-8");
      },
      /signed index indexes\/.* is hard-linked or doesn't match its pinned size or digest$/,
    ],
    [
      "resized model",
      (fixture) => writeFileSync(fixture.mediumModelPath, "changed", "utf-8"),
      /model file .*medium\.onnx is the wrong size$/,
    ],
    [
      "hard-linked model",
      (fixture) => linkSync(fixture.smallModelPath, join(fixture.aiDataDir, "small-copy.onnx")),
      /model file .*small\.onnx is hard-linked or failed its digest check$/,
    ],
    [
      "corrupt execution code",
      (fixture) => writeFileSync(fixture.adapterPath, "# evil adapter\n", "utf-8"),
      /runtime file .*ocr_runtime\.py is hard-linked or doesn't match its size or digest$/,
    ],
    [
      "hard-linked python",
      (fixture) => linkSync(fixture.pythonPath, join(fixture.aiDataDir, "python-copy")),
      /runtime file .*venv\/bin\/python is hard-linked or doesn't match its size or digest$/,
    ],
    [
      "corrupt site-packages file",
      (fixture) => writeFileSync(fixture.sitePackagePath, "rapidocr-v2\n", "utf-8"),
      /runtime payload file venv\/lib\/python3\.12\/site-packages\/rapidocr\/__init__\.py doesn't match its signed size, digest, or mode$/,
    ],
    [
      "payload file with the wrong mode",
      (fixture) => chmodSync(fixture.sitePackagePath, 0o664),
      /runtime payload file .*__init__\.py doesn't match its signed size, digest, or mode$/,
    ],
    [
      "unsigned file in the payload",
      (fixture) => writeFileSync(join(fixture.runtimeRoot, "extra.txt"), "x", "utf-8"),
      /runtime payload file extra\.txt isn't in the signed file list$/,
    ],
    [
      "missing python",
      (fixture) => unlinkSync(fixture.pythonPath),
      /runtime python runtimes\/ocr\/.*\/venv\/bin\/python is missing, behind a symlink, or not a plain file$/,
    ],
    [
      "malformed descriptor field",
      (fixture) =>
        mutateDescriptor(fixture.descriptorPath, (descriptor) => {
          descriptor.artifact.arch = null;
        }),
      /active descriptor has a missing or malformed field$/,
    ],
    [
      "missing descriptor section",
      (fixture) =>
        mutateDescriptor(fixture.descriptorPath, (descriptor) => {
          Reflect.deleteProperty(descriptor, "health");
        }),
      /active descriptor is missing a section or has one that isn't an object$/,
    ],
    [
      "descriptor that drifted from its signed artifact",
      (fixture) =>
        mutateDescriptor(fixture.descriptorPath, (descriptor) => {
          descriptor.artifact.version = "9.9.9";
        }),
      /active descriptor doesn't match its signed artifact$/,
    ],
    [
      "empty descriptor",
      (fixture) => writeFileSync(fixture.descriptorPath, "", "utf-8"),
      /active descriptor active\/ocr\.json is empty, too large, hard-linked, not a plain file, or changed while being read$/,
    ],
    [
      "symlinked active directory",
      (fixture) => {
        const activeDir = join(fixture.aiDataDir, "v3", "active");
        const externalActiveDir = join(fixture.aiDataDir, "external-active");
        const descriptorJson = readFileSync(fixture.descriptorPath, "utf-8");
        rmSync(activeDir, { recursive: true });
        mkdirSync(externalActiveDir);
        writeFileSync(join(externalActiveDir, "ocr.json"), descriptorJson, "utf-8");
        symlinkSync(externalActiveDir, activeDir, "dir");
      },
      /active descriptor path active\/ocr\.json runs through a symlink$/,
    ],
    [
      "symlinked v3 root",
      (fixture) => {
        const v3Root = join(fixture.aiDataDir, "v3");
        renameSync(v3Root, join(fixture.aiDataDir, "v3-real"));
        symlinkSync(join(fixture.aiDataDir, "v3-real"), v3Root, "dir");
      },
      /v3 root is a symlink or not a directory$/,
    ],
    [
      "missing activation marker",
      (fixture) => unlinkSync(fixture.activationPath),
      /activation marker rollback\/ocr\.json is missing$/,
    ],
    [
      "descriptor that no longer matches its activation marker",
      (fixture) =>
        writeFileSync(
          fixture.descriptorPath,
          `${readFileSync(fixture.descriptorPath, "utf-8")} `,
          "utf-8",
        ),
      /activation marker rollback\/ocr\.json vouches for a different descriptor than active\/ocr\.json$/,
    ],
  ])("names the failing check: %s", (_label, corrupt, expected) => {
    const fixture = createRuntimeFixture();
    corrupt(fixture);
    const warn = quietWarn();

    expect(getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, ...linuxX64 })).toMatchObject({
      status: "invalid",
      reason: "descriptor-invalid",
    });
    expect(warnings(warn)).toEqual([expect.stringMatching(expected)]);
  });

  it("caps a huge value from the data volume to a bounded log line", () => {
    const fixture = createRuntimeFixture();
    mutateActivationState(fixture.activationPath, (state) => {
      state.status = "a".repeat(5_000);
    });
    const warn = quietWarn();

    getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, ...linuxX64 });

    const [line] = warnings(warn);
    expect(line).toMatch(/activation marker rollback\/ocr\.json status is "a+$/);
    expect(line.length).toBeLessThan(700);
  });

  it("flattens control characters an error message carries into the log", () => {
    const fixture = createRuntimeFixture();
    const escapeChar = String.fromCharCode(27);
    const warn = quietWarn();

    // An error quotes its path raw, unlike the JSON-quoted marker values.
    getOcrRuntimeCapability({
      aiDataDir: fixture.aiDataDir,
      ...linuxX64,
      trustStorePath: join(fixture.aiDataDir, `trust${escapeChar}[2K\nfake line.json`),
    });

    const [line] = warnings(warn);
    expect(line).toMatch(
      /Unable to read the OCR runtime trust store at .*trust \[2K fake line\.json/,
    );
    expect(line).not.toMatch(/\p{Cc}/u);
  });

  it.skipIf(process.getuid?.() === 0)(
    "reports a permission error as itself, not as a missing file",
    () => {
      const fixture = createRuntimeFixture();
      const indexesDir = join(fixture.aiDataDir, "v3", "indexes");
      const warn = quietWarn();
      chmodSync(indexesDir, 0o000);
      try {
        expect(
          getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, ...linuxX64 }),
        ).toMatchObject({ status: "invalid", reason: "descriptor-invalid" });
      } finally {
        chmodSync(indexesDir, 0o755);
      }
      expect(warnings(warn)).toEqual([
        expect.stringMatching(/active runtime could not be read: EACCES: permission denied/),
      ]);
    },
  );

  it("keeps the message and cause of an error thrown while reading the runtime", () => {
    const fixture = createRuntimeFixture();
    const warn = quietWarn();

    expect(
      getOcrRuntimeCapability({
        aiDataDir: fixture.aiDataDir,
        ...linuxX64,
        trustStorePath: join(fixture.aiDataDir, "no-such-trust-store.json"),
      }),
    ).toMatchObject({ status: "invalid", reason: "descriptor-invalid" });
    expect(warnings(warn)).toEqual([
      expect.stringMatching(
        /active runtime could not be read: Unable to read the OCR runtime trust store at .*no-such-trust-store\.json: ENOENT: no such file or directory/,
      ),
    ]);
  });

  it("still answers when a thrown error is its own cause", () => {
    const fixture = createRuntimeFixture();
    const loop = new Error("loop");
    loop.cause = loop;
    const trustKeys = {
      find() {
        throw loop;
      },
    } as unknown as readonly OcrRuntimeTrustKey[];
    const warn = quietWarn();

    expect(
      getOcrRuntimeCapability({ aiDataDir: fixture.aiDataDir, ...linuxX64, trustKeys }),
    ).toMatchObject({ status: "invalid", reason: "descriptor-invalid" });
    expect(warnings(warn)).toEqual([
      expect.stringMatching(/signed index failed verification: loop: loop: loop/),
    ]);
  });

  it("carries the verifier's reason when the signed index isn't trusted", () => {
    const fixture = createRuntimeFixture();
    const otherKey = generateKeyPairSync("ed25519");
    const warn = quietWarn();

    expect(
      getOcrRuntimeCapability({
        aiDataDir: fixture.aiDataDir,
        ...linuxX64,
        trustKeys: [
          {
            keyId: "some-other-key",
            algorithm: "ed25519",
            publicKey: otherKey.publicKey.export({ type: "spki", format: "pem" }).toString(),
          },
        ],
      }),
    ).toMatchObject({ status: "invalid", reason: "descriptor-invalid" });
    expect(warnings(warn)).toEqual([
      expect.stringMatching(
        /signed index failed verification: OCR runtime index key "runtime-state-test-key" is not trusted$/,
      ),
    ]);
  });
});

describe("OCR activation identity", () => {
  it("reads the exact committed descriptor hash without walking runtime payloads", () => {
    const fixture = createRuntimeFixture();
    const raw = readFileSync(fixture.descriptorPath);
    const expected = {
      generation: "generation-test",
      descriptorSha256: createHash("sha256").update(raw).digest("hex"),
    };

    expect(
      readCommittedOcrRuntimeActivationIdentity({
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toEqual(expected);
    expect(
      readActiveRuntime("ocr", {
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      })?.activationDescriptorSha256,
    ).toBe(expected.descriptorSha256);

    writeFileSync(fixture.descriptorPath, "not-json\n", "utf8");
    expect(
      readCommittedOcrRuntimeActivationIdentity({
        aiDataDir: fixture.aiDataDir,
        platform: "linux",
        arch: "x64",
      }),
    ).toBeNull();
  });
});
