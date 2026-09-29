import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { APP_VERSION } from "@snapotter/shared";
import {
  canonicalRuntimeJson,
  loadOcrRuntimeTrustKeys,
  OCR_RUNTIME_INDEX_MAX_BYTES,
  type OcrRuntimeTarget,
  type OcrRuntimeTrustKey,
  verifyRuntimeIndex,
} from "./runtime-index.js";
import { hasOcrRuntimeMemory, type OcrRuntimeMemoryOptions } from "./runtime-resources.js";

export type { OcrRuntimeTarget } from "./runtime-index.js";

export type OcrRuntimeQuality = "balanced" | "best";

export const OCR_RUNTIME_PROTOCOL_VERSION = 1;

export interface ActiveRuntimeDescriptor {
  schemaVersion: 1;
  family: "ocr";
  generation: string;
  status: "ready";
  /** SHA-256 of the exact canonical active descriptor authenticated by rollback state. */
  activationDescriptorSha256: string;
  activatedAt: string;
  artifact: {
    version: string;
    target: OcrRuntimeTarget;
    platform: "linux";
    arch: "amd64" | "arm64";
    sha256: string;
    signedIndex: RuntimeSignedIndex;
    models: Readonly<Record<string, string>>;
    modelFiles: Readonly<Record<string, { path: string; sha256: string; size: number }>>;
  };
  runtime: {
    /** Absolute root of the immutable generation, derived rather than trusted. */
    root: string;
    /** Absolute, containment-checked path returned by readActiveRuntime. */
    pythonPath: string;
    /** Absolute, containment-checked path returned by readActiveRuntime. */
    entrypoint: string;
    /** Small execution-critical files rehashed when their filesystem identity changes. */
    integrityFiles: Readonly<Record<RuntimeIntegrityFileId, RuntimeIntegrityFile>>;
  };
  compatibility: {
    protocolVersion: typeof OCR_RUNTIME_PROTOCOL_VERSION;
    snapotterVersion: string;
  };
  capabilities: {
    qualities: readonly OcrRuntimeQuality[];
    providers: readonly string[];
  };
  health: {
    status: "healthy";
    checkedAt: string;
    detail?: string;
  };
}

export type RuntimeIntegrityFileId = "python" | "entrypoint" | "adapter";

export interface RuntimeIntegrityFile {
  path: string;
  sha256: string;
  size: number;
}

export interface RuntimeSignedIndex {
  path: string;
  sha256: string;
  size: number;
}

export interface RuntimePlatformOptions {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  /** Test/build seam. Production defaults to the official-container marker. */
  officialContainer?: boolean;
}

export interface RuntimeStateOptions extends RuntimePlatformOptions, OcrRuntimeMemoryOptions {
  /** Direct override for the AI data root (for example, /data/ai). */
  aiDataDir?: string;
  /** SnapOtter data root. Used as `${dataDir}/ai` when aiDataDir is absent. */
  dataDir?: string;
  /** Test/operator seam. Production defaults to the image-pinned or custom trust store. */
  trustKeys?: readonly OcrRuntimeTrustKey[];
  trustStorePath?: string;
}

export type OcrRuntimeUnavailableReason =
  | "descriptor-missing"
  | "descriptor-invalid"
  | "artifact-incompatible"
  | "insufficient-memory"
  | "memory-capacity-unknown"
  | "unsupported-host";

export type OcrRuntimeCapability =
  | {
      available: true;
      status: "ready";
      qualities: readonly OcrRuntimeQuality[];
      providers: readonly string[];
      descriptor: ActiveRuntimeDescriptor;
    }
  | {
      available: false;
      status: "missing" | "invalid" | "incompatible";
      reason: OcrRuntimeUnavailableReason;
      qualities: readonly [];
      providers: readonly [];
    };

interface ActiveRuntimeFailure {
  descriptor: null;
  status: "missing" | "invalid" | "incompatible";
  reason: OcrRuntimeUnavailableReason;
  /** Which check failed, for the server log only; it can hold paths (#1433). */
  detail?: string;
}

interface ActiveRuntimeSuccess {
  descriptor: ActiveRuntimeDescriptor;
  status: "ready";
}

type ActiveRuntimeResult = ActiveRuntimeFailure | ActiveRuntimeSuccess;

interface DescriptorValidationFailure {
  descriptor: null;
  status: "invalid" | "incompatible";
  reason:
    | "descriptor-invalid"
    | "artifact-incompatible"
    | "insufficient-memory"
    | "memory-capacity-unknown";
  detail?: string;
}

interface DescriptorValidationSuccess {
  descriptor: ActiveRuntimeDescriptor;
  status: "ready";
}

type DescriptorValidation = DescriptorValidationFailure | DescriptorValidationSuccess;

function invalidDescriptor(detail: string): DescriptorValidationFailure {
  return { descriptor: null, status: "invalid", reason: "descriptor-invalid", detail };
}

const INCOMPATIBLE_ARTIFACT: DescriptorValidationFailure = {
  descriptor: null,
  status: "incompatible",
  reason: "artifact-incompatible",
};

const INSUFFICIENT_MEMORY: DescriptorValidationFailure = {
  descriptor: null,
  status: "incompatible",
  reason: "insufficient-memory",
};

const UNKNOWN_MEMORY_CAPACITY: DescriptorValidationFailure = {
  descriptor: null,
  status: "incompatible",
  reason: "memory-capacity-unknown",
};

const MISSING_DESCRIPTOR: ActiveRuntimeFailure = {
  descriptor: null,
  status: "missing",
  reason: "descriptor-missing",
};

const UNSUPPORTED_HOST: ActiveRuntimeFailure = {
  descriptor: null,
  status: "incompatible",
  reason: "unsupported-host",
};

const ACTIVE_DESCRIPTOR_MAX_BYTES = 65_536;
// Repair payloads live in digest-verified quarantine files, so the canonical
// activation marker itself remains tightly bounded.
const ACTIVATION_STATE_MAX_BYTES = 2 * 1024 * 1024;
const PREVIOUS_DESCRIPTOR_MAX_BYTES = 1024 * 1024;
const SAFE_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

type ActivationStatus = "committed" | "pending";

export function selectOcrRuntimeTarget(
  options: RuntimePlatformOptions = {},
): OcrRuntimeTarget | null {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const explicitPlatformTest = options.platform !== undefined || options.arch !== undefined;
  const officialContainer =
    options.officialContainer ??
    (explicitPlatformTest ? true : process.env.SNAPOTTER_OFFICIAL_CONTAINER === "1");

  if (!officialContainer || platform !== "linux") return null;
  if (arch === "x64") return "linux-amd64-cpu-py312";
  if (arch === "arm64") return "linux-arm64-cpu-py311";
  return null;
}

export function resolveAiDataDir(options: RuntimeStateOptions = {}): string {
  if (options.aiDataDir) return resolve(options.aiDataDir);
  if (options.dataDir) return resolve(options.dataDir, "ai");
  if (process.env.DATA_DIR) return resolve(process.env.DATA_DIR, "ai");
  if (process.env.AI_DATA_DIR) return resolve(process.env.AI_DATA_DIR);
  return resolve("./data", "ai");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasOcrQualities(value: unknown): value is OcrRuntimeQuality[] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  return value.includes("balanced") && value.includes("best") && new Set(value).size === 2;
}

function hasProviders(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!value.every(isNonEmptyString)) return false;
  return new Set(value).size === value.length;
}

function hasModelDigests(value: unknown): value is Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  return Object.entries(value).every(
    ([modelId, digest]) =>
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(modelId) &&
      typeof digest === "string" &&
      /^[a-f0-9]{64}$/.test(digest),
  );
}

function hasModelFiles(
  value: unknown,
  models: Record<string, string>,
): value is Record<string, { path: string; sha256: string; size: number }> {
  if (!isRecord(value)) return false;
  const modelIds = Object.keys(models).sort();
  if (Object.keys(value).sort().join("\0") !== modelIds.join("\0")) return false;
  const paths = new Set<string>();
  const valid = modelIds.every((modelId) => {
    const file = value[modelId];
    if (!isRecord(file) || !isNonEmptyString(file.path)) return false;
    if (
      file.sha256 !== models[modelId] ||
      typeof file.size !== "number" ||
      !Number.isSafeInteger(file.size) ||
      file.size <= 0 ||
      paths.has(file.path)
    ) {
      return false;
    }
    paths.add(file.path);
    return true;
  });
  return valid;
}

function hasRuntimeIntegrityFiles(
  value: unknown,
): value is Record<RuntimeIntegrityFileId, RuntimeIntegrityFile> {
  if (!isRecord(value)) return false;
  const expectedKeys: RuntimeIntegrityFileId[] = ["adapter", "entrypoint", "python"];
  if (Object.keys(value).sort().join("\0") !== expectedKeys.join("\0")) return false;
  return expectedKeys.every((key) => {
    const file = value[key];
    return (
      isRecord(file) &&
      isNonEmptyString(file.path) &&
      typeof file.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(file.sha256) &&
      typeof file.size === "number" &&
      Number.isSafeInteger(file.size) &&
      file.size > 0
    );
  });
}

function hasSignedIndex(value: unknown): value is RuntimeSignedIndex {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    /^indexes\/[a-f0-9]{64}\.json$/.test(value.path) &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    value.path === `indexes/${value.sha256}.json` &&
    typeof value.size === "number" &&
    Number.isSafeInteger(value.size) &&
    value.size > 0 &&
    value.size <= OCR_RUNTIME_INDEX_MAX_BYTES
  );
}

const verifiedDigestCache = new Map<
  string,
  { filesystemIdentity: string; expectedSha256: string; valid: boolean }
>();

const verifiedIndexCache = new Map<
  string,
  { filesystemIdentity: string; expectedSha256: string; raw: Buffer }
>();
// Runtime capture is synchronous, so one reusable scratch buffer avoids
// allocating roughly one MiB for each of several thousand payload files.
const fileHashBuffer = Buffer.allocUnsafe(1024 * 1024);

type BigIntFileStats = ReturnType<typeof lstatSync> & {
  dev: bigint;
  ino: bigint;
  mode: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
};

function fileIdentity(info: BigIntFileStats): string {
  return [info.dev, info.ino, info.mode, info.nlink, info.size, info.mtimeNs, info.ctimeNs].join(
    ":",
  );
}

function readBoundedStateFile(path: string, maxBytes: number): Buffer | null {
  const before = lstatSync(path, { bigint: true }) as BigIntFileStats;
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    before.size <= 0n ||
    before.size > BigInt(maxBytes)
  ) {
    return null;
  }

  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    if (fileIdentity(opened) !== fileIdentity(before) || !opened.isFile()) return null;

    const raw = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < raw.length) {
      const bytesRead = readSync(descriptor, raw, offset, raw.length - offset, null);
      if (bytesRead === 0) return null;
      offset += bytesRead;
    }
    const trailing = Buffer.allocUnsafe(1);
    if (readSync(descriptor, trailing, 0, 1, null) !== 0) return null;
    const after = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    return fileIdentity(after) === fileIdentity(before) ? raw : null;
  } finally {
    closeSync(descriptor);
  }
}

function descriptorReferences(
  raw: Buffer,
  family: "ocr",
): { generation: string; indexPath: string } | null {
  try {
    const parsed: unknown = JSON.parse(raw.toString("utf8"));
    if (
      !isRecord(parsed) ||
      raw.toString("utf8") !== canonicalRuntimeJson(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.family !== family ||
      typeof parsed.generation !== "string" ||
      !SAFE_COMPONENT_PATTERN.test(parsed.generation)
    ) {
      return null;
    }
    const signedIndex = isRecord(parsed.artifact) ? parsed.artifact.signedIndex : null;
    if (
      !isRecord(signedIndex) ||
      typeof signedIndex.path !== "string" ||
      !/^indexes\/[a-f0-9]{64}\.json$/.test(signedIndex.path)
    ) {
      return null;
    }
    const indexPath = signedIndex.path;
    return { generation: parsed.generation, indexPath };
  } catch {
    return null;
  }
}

// The installer writes a pending marker, swaps in the new descriptor, and
// commits after the dispatcher handoff. Reads in that window see this, which is
// normal during an install and only a fault if it never commits.
const PENDING_COMMIT_DETAIL =
  "activation marker is still pending commit (an install is running or was interrupted)";

/** Says why the activation marker doesn't vouch for the active descriptor, or null if it does. */
function activationStateMismatch(
  v3Root: string,
  family: "ocr",
  rawDescriptor: Buffer,
  requiredStatus: ActivationStatus,
): string | null {
  const markerPath = join(v3Root, "rollback", `${family}.json`);
  const marker = `activation marker rollback/${family}.json`;
  let rawMarker: Buffer | null;
  try {
    if (!isSymlinkFreePath(v3Root, markerPath)) return `${marker} runs through a symlink`;
    rawMarker = readBoundedStateFile(markerPath, ACTIVATION_STATE_MAX_BYTES);
  } catch (error) {
    if (isMissingPathError(error)) return `${marker} is missing`;
    return `${marker} could not be read: ${errorMessage(error)}`;
  }
  if (!rawMarker) return `${marker} is empty, too large, hard-linked, or not a plain file`;

  try {
    const parsed: unknown = JSON.parse(rawMarker.toString("utf8"));
    if (
      !isRecord(parsed) ||
      rawMarker.toString("utf8") !== canonicalRuntimeJson(parsed) ||
      parsed.schemaVersion !== 1 ||
      parsed.family !== family ||
      typeof parsed.activatedGeneration !== "string" ||
      !SAFE_COMPONENT_PATTERN.test(parsed.activatedGeneration) ||
      typeof parsed.activatedDescriptorSha256 !== "string" ||
      !SHA256_PATTERN.test(parsed.activatedDescriptorSha256)
    ) {
      return `${marker} is not a canonical ${family} marker`;
    }
    if (parsed.status !== requiredStatus) {
      return parsed.status === "pending"
        ? PENDING_COMMIT_DETAIL
        : `${marker} status is ${String(parsed.status)}, expected ${requiredStatus}`;
    }

    const active: unknown = JSON.parse(rawDescriptor.toString("utf8"));
    if (
      !isRecord(active) ||
      active.family !== family ||
      active.generation !== parsed.activatedGeneration ||
      createHash("sha256").update(rawDescriptor).digest("hex") !== parsed.activatedDescriptorSha256
    ) {
      return `${marker} vouches for a different descriptor than active/${family}.json`;
    }

    const previousMalformed = `${marker} has a malformed previous-descriptor record`;
    if (parsed.previousDescriptorB64 === null) {
      return parsed.previousGeneration === null && parsed.previousIndexPath === null
        ? null
        : previousMalformed;
    }
    if (typeof parsed.previousDescriptorB64 !== "string") return previousMalformed;
    const previous = Buffer.from(parsed.previousDescriptorB64, "base64");
    if (
      previous.length > PREVIOUS_DESCRIPTOR_MAX_BYTES ||
      previous.toString("base64") !== parsed.previousDescriptorB64
    ) {
      return previousMalformed;
    }
    const references = descriptorReferences(previous, family);
    return references !== null &&
      parsed.previousGeneration === references.generation &&
      parsed.previousIndexPath === references.indexPath
      ? null
      : previousMalformed;
  } catch (error) {
    return `${marker} or the active descriptor isn't valid JSON: ${errorMessage(error)}`;
  }
}

function sha256DescriptorSync(descriptor: number): string {
  const hash = createHash("sha256");
  while (true) {
    const bytesRead = readSync(descriptor, fileHashBuffer, 0, fileHashBuffer.length, null);
    if (bytesRead === 0) break;
    hash.update(fileHashBuffer.subarray(0, bytesRead));
  }
  return hash.digest("hex");
}

function verifyRuntimeFileDigest(
  path: string,
  expectedSize: number,
  expectedSha256: string,
  expectedMode?: number,
): boolean {
  const info = lstatSync(path, { bigint: true }) as BigIntFileStats;
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1n ||
    info.size !== BigInt(expectedSize) ||
    (expectedMode !== undefined && Number(info.mode & 0o777n) !== expectedMode)
  ) {
    return false;
  }
  const filesystemIdentity = fileIdentity(info);
  const cached = verifiedDigestCache.get(path);
  if (
    cached?.filesystemIdentity === filesystemIdentity &&
    cached.expectedSha256 === expectedSha256
  ) {
    return cached.valid;
  }
  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let valid = false;
  try {
    const opened = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    if (fileIdentity(opened) !== filesystemIdentity || !opened.isFile()) return false;
    valid = sha256DescriptorSync(descriptor) === expectedSha256;
    const afterRead = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    if (fileIdentity(afterRead) !== filesystemIdentity) valid = false;
  } finally {
    closeSync(descriptor);
  }
  verifiedDigestCache.set(path, { filesystemIdentity, expectedSha256, valid });
  return valid;
}

function expectedArtifactArch(target: OcrRuntimeTarget): "amd64" | "arm64" {
  return target === "linux-amd64-cpu-py312" ? "amd64" : "arm64";
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot.length > 0 &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

function isSymlinkFreePath(root: string, candidate: string): boolean {
  if (!isContainedPath(root, candidate)) return false;

  let current = root;
  for (const segment of relative(root, candidate).split(sep)) {
    current = join(current, segment);
    if (lstatSync(current).isSymbolicLink()) return false;
  }
  return true;
}

function resolveRuntimeFile(
  v3Root: string,
  target: OcrRuntimeTarget,
  generation: string,
  pathValue: unknown,
): string | null {
  if (!isNonEmptyString(pathValue) || isAbsolute(pathValue) || pathValue.includes("\\")) {
    return null;
  }

  const segments = pathValue.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }

  try {
    const generationRoot = resolve(v3Root, "runtimes", "ocr", target, generation);
    const candidate = resolve(v3Root, pathValue);
    if (!isContainedPath(generationRoot, candidate)) return null;

    if (!isSymlinkFreePath(v3Root, candidate)) return null;

    return lstatSync(candidate).isFile() ? candidate : null;
  } catch (error) {
    // Only a missing path means "missing"; a permission error is rethrown so
    // the invalid-runtime log reports it instead of a misleading "missing".
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR";
}

interface SignedPayloadFile {
  path: string;
  sha256: string;
  size: number;
  mode: number;
}

function safeArtifactPath(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")) {
    return false;
  }
  if (value.startsWith("/") || value.endsWith("/")) return false;
  return value
    .split("/")
    .every((component) => component !== "" && component !== "." && component !== "..");
}

function signedPayloadManifest(value: unknown): Map<string, SignedPayloadFile> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100_000) return null;
  const manifest = new Map<string, SignedPayloadFile>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !safeArtifactPath(candidate.path) ||
      typeof candidate.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.sha256) ||
      typeof candidate.size !== "number" ||
      !Number.isSafeInteger(candidate.size) ||
      candidate.size < 0 ||
      typeof candidate.mode !== "number" ||
      !Number.isSafeInteger(candidate.mode) ||
      candidate.mode <= 0 ||
      candidate.mode > 0o777 ||
      manifest.has(candidate.path)
    ) {
      return null;
    }
    manifest.set(candidate.path, {
      path: candidate.path,
      sha256: candidate.sha256,
      size: candidate.size,
      mode: candidate.mode,
    });
  }
  return manifest;
}

function sameCanonicalJson(left: unknown, right: unknown): boolean {
  return canonicalRuntimeJson(left) === canonicalRuntimeJson(right);
}

function resolveSignedIndex(v3Root: string, signedIndex: RuntimeSignedIndex): string | null {
  try {
    const indexesRoot = resolve(v3Root, "indexes");
    const candidate = resolve(v3Root, signedIndex.path);
    if (!isContainedPath(indexesRoot, candidate) || !isSymlinkFreePath(v3Root, candidate)) {
      return null;
    }
    return candidate;
  } catch (error) {
    if (isMissingPathError(error)) return null;
    throw error;
  }
}

function readPinnedIndex(path: string, expected: RuntimeSignedIndex): Buffer | null {
  const info = lstatSync(path, { bigint: true }) as BigIntFileStats;
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1n ||
    info.size !== BigInt(expected.size)
  ) {
    return null;
  }
  const filesystemIdentity = fileIdentity(info);
  const cached = verifiedIndexCache.get(path);
  if (
    cached?.filesystemIdentity === filesystemIdentity &&
    cached.expectedSha256 === expected.sha256
  ) {
    return cached.raw;
  }

  const descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    if (fileIdentity(opened) !== filesystemIdentity || !opened.isFile()) return null;
    const raw = Buffer.alloc(expected.size);
    let offset = 0;
    while (offset < raw.length) {
      const bytesRead = readSync(descriptor, raw, offset, raw.length - offset, null);
      if (bytesRead === 0) return null;
      offset += bytesRead;
    }
    const trailing = Buffer.allocUnsafe(1);
    if (readSync(descriptor, trailing, 0, 1, null) !== 0) return null;
    const afterRead = fstatSync(descriptor, { bigint: true }) as BigIntFileStats;
    if (fileIdentity(afterRead) !== filesystemIdentity) return null;
    if (createHash("sha256").update(raw).digest("hex") !== expected.sha256) return null;
    verifiedIndexCache.set(path, {
      filesystemIdentity,
      expectedSha256: expected.sha256,
      raw,
    });
    return raw;
  } finally {
    closeSync(descriptor);
  }
}

/** Names the first payload file that breaks the signed file list, or null if none does. */
function payloadTreeMismatch(
  root: string,
  manifest: Map<string, SignedPayloadFile>,
): string | null {
  const actualPaths = new Set<string>();
  const walk = (directory: string): string | null => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      const relativePath = relative(root, path).split(sep).join("/");
      const info = lstatSync(path, { bigint: true });
      if (info.isSymbolicLink()) return `${relativePath} is a symlink`;
      if (info.isDirectory()) {
        const mismatch = walk(path);
        if (mismatch) return mismatch;
        continue;
      }
      if (!info.isFile() || info.nlink !== 1n) {
        return `${relativePath} is hard-linked or not a plain file`;
      }
      const expected = manifest.get(relativePath);
      if (!expected || actualPaths.has(relativePath)) {
        return `${relativePath} isn't in the signed file list`;
      }
      actualPaths.add(relativePath);
      if (!verifyRuntimeFileDigest(path, expected.size, expected.sha256, expected.mode)) {
        return `${relativePath} doesn't match its signed size, digest, or mode`;
      }
    }
    return null;
  };

  const mismatch = walk(root);
  if (mismatch) return mismatch;
  for (const expectedPath of manifest.keys()) {
    if (!actualPaths.has(expectedPath)) return `${expectedPath} is missing`;
  }
  return null;
}

function validateSignedArtifact(
  artifact: Record<string, unknown>,
  descriptor: Record<string, unknown>,
  target: OcrRuntimeTarget,
): Map<string, SignedPayloadFile> | null {
  const descriptorArtifact = descriptor.artifact;
  const descriptorRuntime = descriptor.runtime;
  const descriptorCompatibility = descriptor.compatibility;
  const descriptorCapabilities = descriptor.capabilities;
  const archive = artifact.archive;
  const runtime = artifact.runtime;
  const compatibility = artifact.compatibility;
  const capabilities = artifact.capabilities;
  if (
    !isRecord(descriptorArtifact) ||
    !isRecord(descriptorRuntime) ||
    !isRecord(descriptorCompatibility) ||
    !isRecord(descriptorCapabilities) ||
    !isRecord(archive) ||
    !isRecord(runtime) ||
    !isRecord(compatibility) ||
    !isRecord(capabilities) ||
    artifact.family !== "ocr" ||
    artifact.target !== target ||
    artifact.generation !== descriptor.generation ||
    artifact.version !== descriptorArtifact.version ||
    artifact.platform !== descriptorArtifact.platform ||
    artifact.arch !== descriptorArtifact.arch ||
    archive.sha256 !== descriptorArtifact.sha256 ||
    !sameCanonicalJson(artifact.models, descriptorArtifact.models) ||
    !sameCanonicalJson(compatibility, descriptorCompatibility) ||
    !sameCanonicalJson(capabilities, descriptorCapabilities)
  ) {
    return null;
  }

  const manifest = signedPayloadManifest(artifact.files);
  if (!manifest) return null;
  for (const key of ["pythonPath", "entrypoint", "adapterPath"] as const) {
    if (!safeArtifactPath(runtime[key]) || !manifest.has(runtime[key])) return null;
  }

  const prefix = `runtimes/ocr/${target}/${String(descriptor.generation)}`;
  if (
    descriptorRuntime.pythonPath !== `${prefix}/${runtime.pythonPath}` ||
    descriptorRuntime.entrypoint !== `${prefix}/${runtime.entrypoint}`
  ) {
    return null;
  }

  const expectedRuntimeFiles = {
    python: manifest.get(String(runtime.pythonPath)),
    entrypoint: manifest.get(String(runtime.entrypoint)),
    adapter: manifest.get(String(runtime.adapterPath)),
  };
  const descriptorIntegrityFiles = descriptorRuntime.integrityFiles;
  if (!isRecord(descriptorIntegrityFiles)) return null;
  for (const [fileId, expected] of Object.entries(expectedRuntimeFiles)) {
    const described = descriptorIntegrityFiles[fileId];
    if (
      !expected ||
      !isRecord(described) ||
      described.path !== `${prefix}/${expected.path}` ||
      described.sha256 !== expected.sha256 ||
      described.size !== expected.size
    ) {
      return null;
    }
  }

  if (!isRecord(artifact.models) || !isRecord(descriptorArtifact.modelFiles)) return null;
  const expectedModelFiles = new Map<string, SignedPayloadFile>();
  for (const [modelId, digest] of Object.entries(artifact.models)) {
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(modelId) ||
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(digest)
    ) {
      return null;
    }
    const matches = [...manifest.values()].filter(
      (file) => file.path.startsWith("models/") && file.sha256 === digest,
    );
    if (matches.length !== 1) return null;
    expectedModelFiles.set(modelId, matches[0]);
  }
  if (Object.keys(descriptorArtifact.modelFiles).length !== expectedModelFiles.size) return null;
  for (const [modelId, expected] of expectedModelFiles) {
    const described = descriptorArtifact.modelFiles[modelId];
    if (
      !isRecord(described) ||
      described.path !== `${prefix}/${expected.path}` ||
      described.sha256 !== expected.sha256 ||
      described.size !== expected.size
    ) {
      return null;
    }
  }

  return manifest;
}

function parseOcrDescriptor(
  value: unknown,
  v3Root: string,
  target: OcrRuntimeTarget,
  trustKeys: readonly OcrRuntimeTrustKey[],
  memoryOptions: OcrRuntimeMemoryOptions,
  activationDescriptorSha256: string,
): DescriptorValidation {
  if (!isRecord(value)) return invalidDescriptor("active descriptor is not a JSON object");

  const artifact = value.artifact;
  const runtime = value.runtime;
  const compatibility = value.compatibility;
  const capabilities = value.capabilities;
  const health = value.health;
  if (
    !isRecord(artifact) ||
    !isRecord(runtime) ||
    !isRecord(compatibility) ||
    !isRecord(capabilities) ||
    !isRecord(health)
  ) {
    return invalidDescriptor(
      "active descriptor is missing a section or has one that isn't an object",
    );
  }
  const expectedArch = expectedArtifactArch(target);

  if (
    value.schemaVersion !== 1 ||
    value.family !== "ocr" ||
    value.status !== "ready" ||
    !isNonEmptyString(value.generation) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.generation) ||
    !isIsoTimestamp(value.activatedAt) ||
    !isNonEmptyString(artifact.version) ||
    !isNonEmptyString(artifact.target) ||
    typeof artifact.platform !== "string" ||
    typeof artifact.arch !== "string" ||
    typeof artifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
    !hasSignedIndex(artifact.signedIndex) ||
    !hasModelDigests(artifact.models) ||
    !hasModelFiles(artifact.modelFiles, artifact.models) ||
    !hasRuntimeIntegrityFiles(runtime.integrityFiles) ||
    !hasOcrQualities(capabilities.qualities) ||
    !hasProviders(capabilities.providers) ||
    health.status !== "healthy" ||
    !isIsoTimestamp(health.checkedAt) ||
    (health.detail !== undefined && typeof health.detail !== "string")
  ) {
    // The installer only ever writes "healthy", so another status means a hand edit.
    return invalidDescriptor(
      health.status === "healthy"
        ? "active descriptor has a missing or malformed field"
        : `active descriptor health status is ${String(health.status)}, not healthy`,
    );
  }
  if (
    artifact.target !== target ||
    artifact.platform !== "linux" ||
    artifact.arch !== expectedArch ||
    compatibility.protocolVersion !== OCR_RUNTIME_PROTOCOL_VERSION ||
    compatibility.snapotterVersion !== APP_VERSION
  ) {
    return INCOMPATIBLE_ARTIFACT;
  }

  const signedIndexPath = resolveSignedIndex(v3Root, artifact.signedIndex);
  if (!signedIndexPath) {
    return invalidDescriptor(
      `signed index ${artifact.signedIndex.path} is missing, outside indexes/, or behind a symlink`,
    );
  }
  const rawIndex = readPinnedIndex(signedIndexPath, artifact.signedIndex);
  if (!rawIndex) {
    return invalidDescriptor(
      `signed index ${artifact.signedIndex.path} doesn't match its pinned size or digest`,
    );
  }
  let signedArtifact: Record<string, unknown>;
  try {
    const verified = verifyRuntimeIndex(rawIndex, target, trustKeys, APP_VERSION);
    try {
      if (!hasOcrRuntimeMemory(verified.minimumMemoryBytes, memoryOptions)) {
        return INSUFFICIENT_MEMORY;
      }
    } catch {
      return UNKNOWN_MEMORY_CAPACITY;
    }
    signedArtifact = verified.artifact;
  } catch (error) {
    return invalidDescriptor(`signed index failed verification: ${errorMessage(error)}`);
  }
  const payloadManifest = validateSignedArtifact(signedArtifact, value, target);
  if (!payloadManifest) {
    return invalidDescriptor("active descriptor doesn't match its signed artifact");
  }

  const pythonPath = resolveRuntimeFile(v3Root, target, value.generation, runtime.pythonPath);
  if (!pythonPath) {
    return invalidDescriptor(
      `runtime python ${String(runtime.pythonPath)} is missing, not a plain file, or outside its generation`,
    );
  }
  const entrypoint = resolveRuntimeFile(v3Root, target, value.generation, runtime.entrypoint);
  if (!entrypoint) {
    return invalidDescriptor(
      `runtime entrypoint ${String(runtime.entrypoint)} is missing, not a plain file, or outside its generation`,
    );
  }
  if (
    runtime.integrityFiles.python.path !== runtime.pythonPath ||
    runtime.integrityFiles.entrypoint.path !== runtime.entrypoint
  ) {
    return invalidDescriptor("runtime integrity files don't name the python and entrypoint");
  }
  for (const file of Object.values(runtime.integrityFiles)) {
    const integrityPath = resolveRuntimeFile(v3Root, target, value.generation, file.path);
    if (!integrityPath) {
      return invalidDescriptor(`runtime file ${file.path} is missing or not a plain file`);
    }
    if (!verifyRuntimeFileDigest(integrityPath, file.size, file.sha256)) {
      return invalidDescriptor(`runtime file ${file.path} doesn't match its size or digest`);
    }
  }
  const modelRoot = resolve(v3Root, "runtimes", "ocr", target, value.generation, "models");
  for (const file of Object.values(artifact.modelFiles)) {
    const modelPath = resolveRuntimeFile(v3Root, target, value.generation, file.path);
    if (!modelPath) {
      return invalidDescriptor(`model file ${file.path} is missing or not a plain file`);
    }
    if (!isContainedPath(modelRoot, modelPath)) {
      return invalidDescriptor(`model file ${file.path} is outside models/`);
    }
    if (lstatSync(modelPath).size !== file.size) {
      return invalidDescriptor(`model file ${file.path} is the wrong size`);
    }
    if (!verifyRuntimeFileDigest(modelPath, file.size, file.sha256)) {
      return invalidDescriptor(`model file ${file.path} failed its digest check`);
    }
  }
  const generationRoot = resolve(v3Root, "runtimes", "ocr", target, value.generation);
  const payloadMismatch = payloadTreeMismatch(generationRoot, payloadManifest);
  if (payloadMismatch) return invalidDescriptor(`runtime payload file ${payloadMismatch}`);

  return {
    status: "ready",
    descriptor: {
      schemaVersion: 1,
      family: "ocr",
      generation: value.generation,
      status: "ready",
      activationDescriptorSha256,
      activatedAt: value.activatedAt,
      artifact: {
        version: artifact.version,
        target,
        platform: "linux",
        arch: expectedArch,
        sha256: artifact.sha256,
        signedIndex: { ...artifact.signedIndex },
        models: { ...artifact.models },
        modelFiles: Object.fromEntries(
          Object.entries(artifact.modelFiles).map(([modelId, file]) => [modelId, { ...file }]),
        ),
      },
      runtime: {
        root: resolve(v3Root, "runtimes", "ocr", target, value.generation),
        pythonPath,
        entrypoint,
        integrityFiles: Object.fromEntries(
          Object.entries(runtime.integrityFiles).map(([fileId, file]) => [fileId, { ...file }]),
        ) as Record<RuntimeIntegrityFileId, RuntimeIntegrityFile>,
      },
      compatibility: {
        protocolVersion: OCR_RUNTIME_PROTOCOL_VERSION,
        snapotterVersion: APP_VERSION,
      },
      capabilities: {
        qualities: [...capabilities.qualities],
        providers: [...capabilities.providers],
      },
      health: {
        status: "healthy",
        checkedAt: health.checkedAt,
        ...(health.detail === undefined ? {} : { detail: health.detail }),
      },
    },
  };
}

function inspectActiveRuntime(
  family: "ocr",
  options: RuntimeStateOptions,
  requiredStatus: ActivationStatus = "committed",
): ActiveRuntimeResult {
  if (family !== "ocr") return invalidDescriptor(`unknown runtime family ${family}`);
  const v3Root = join(resolveAiDataDir(options), "v3");
  const target = selectOcrRuntimeTarget(options);
  if (!target) return UNSUPPORTED_HOST;

  try {
    const rootStat = lstatSync(v3Root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      return invalidDescriptor("v3 root is a symlink or not a directory");
    }

    const descriptorPath = join(v3Root, "active", `${family}.json`);
    if (!isSymlinkFreePath(v3Root, descriptorPath)) {
      return invalidDescriptor(
        `active descriptor path active/${family}.json runs through a symlink`,
      );
    }
    const rawDescriptor = readBoundedStateFile(descriptorPath, ACTIVE_DESCRIPTOR_MAX_BYTES);
    if (!rawDescriptor) {
      return invalidDescriptor(
        `active descriptor active/${family}.json is empty, too large, hard-linked, or not a plain file`,
      );
    }
    const activationMismatch = activationStateMismatch(
      v3Root,
      family,
      rawDescriptor,
      requiredStatus,
    );
    if (activationMismatch) return invalidDescriptor(activationMismatch);

    const trustKeys =
      options.trustKeys ??
      loadOcrRuntimeTrustKeys(
        options.trustStorePath ?? (process.env.SNAPOTTER_OCR_RUNTIME_TRUST_STORE || undefined),
      );

    return parseOcrDescriptor(
      JSON.parse(rawDescriptor.toString("utf8")),
      v3Root,
      target,
      trustKeys,
      options,
      createHash("sha256").update(rawDescriptor).digest("hex"),
    );
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return MISSING_DESCRIPTOR;
    return invalidDescriptor(`active runtime could not be read: ${errorMessage(error)}`);
  }
}

/** An error's message plus each wrapped cause's, so "Unable to read X" says why. */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause === undefined
    ? error.message
    : `${error.message}: ${errorMessage(error.cause)}`;
}

export interface OcrRuntimeActivationIdentity {
  generation: string;
  descriptorSha256: string;
}

function readOcrRuntimeActivationIdentity(
  options: RuntimeStateOptions,
  requiredStatus: ActivationStatus,
): OcrRuntimeActivationIdentity | null {
  const target = selectOcrRuntimeTarget(options);
  if (!target) return null;
  const v3Root = join(resolveAiDataDir(options), "v3");
  const descriptorPath = join(v3Root, "active", "ocr.json");
  try {
    if (!isSymlinkFreePath(v3Root, descriptorPath)) return null;
    const rawDescriptor = readBoundedStateFile(descriptorPath, ACTIVE_DESCRIPTOR_MAX_BYTES);
    if (
      !rawDescriptor ||
      activationStateMismatch(v3Root, "ocr", rawDescriptor, requiredStatus) !== null
    ) {
      return null;
    }
    const parsed: unknown = JSON.parse(rawDescriptor.toString("utf8"));
    if (
      !isRecord(parsed) ||
      typeof parsed.generation !== "string" ||
      !SAFE_COMPONENT_PATTERN.test(parsed.generation)
    ) {
      return null;
    }
    return {
      generation: parsed.generation,
      descriptorSha256: createHash("sha256").update(rawDescriptor).digest("hex"),
    };
  } catch {
    return null;
  }
}

/** Cheap canonical-state probe used only to retire process-local idle children. */
export function readCommittedOcrRuntimeActivationIdentity(
  options: RuntimeStateOptions = {},
): OcrRuntimeActivationIdentity | null {
  return readOcrRuntimeActivationIdentity(options, "committed");
}

/** Pending-state probe lets watchers defer retirement during an installer handoff. */
export function readPendingOcrRuntimeActivationIdentity(
  options: RuntimeStateOptions = {},
): OcrRuntimeActivationIdentity | null {
  return readOcrRuntimeActivationIdentity(options, "pending");
}

export function readActiveRuntime(
  family: "ocr",
  options: RuntimeStateOptions = {},
): ActiveRuntimeDescriptor | null {
  return inspectActiveRuntime(family, options).descriptor;
}

/** Installer-only view of the exact uncommitted runtime during dispatcher handoff. */
export function readPendingOcrRuntimeForHandoff(
  options: RuntimeStateOptions = {},
): ActiveRuntimeDescriptor | null {
  return inspectActiveRuntime("ocr", options, "pending").descriptor;
}

// The capability is polled by feature status and read on every OCR request, so
// an invalid runtime is logged once per distinct failure, not on every read.
// Any read that isn't descriptor-invalid clears it, so a recurrence logs again.
let lastReportedInvalidRuntime: string | null = null;

function reportInvalidRuntime(options: RuntimeStateOptions, result: ActiveRuntimeResult): void {
  if (
    result.descriptor ||
    result.reason !== "descriptor-invalid" ||
    result.detail === PENDING_COMMIT_DETAIL
  ) {
    lastReportedInvalidRuntime = null;
    return;
  }
  // Details can quote index contents, so whitespace is collapsed to keep a
  // crafted value on one log line.
  const detail = (result.detail ?? "no detail recorded").replace(/\s+/g, " ");
  const message = `[ocr-runtime] Accurate OCR runtime at ${join(resolveAiDataDir(options), "v3")} is unavailable: ${detail}`;
  if (message === lastReportedInvalidRuntime) return;
  lastReportedInvalidRuntime = message;
  console.warn(message);
}

export function getOcrRuntimeCapability(options: RuntimeStateOptions = {}): OcrRuntimeCapability {
  const result = inspectActiveRuntime("ocr", options);
  reportInvalidRuntime(options, result);
  if (!result.descriptor) {
    return {
      available: false,
      status: result.status,
      reason: result.reason,
      qualities: [],
      providers: [],
    };
  }

  return {
    available: true,
    status: "ready",
    qualities: [...result.descriptor.capabilities.qualities],
    providers: [...result.descriptor.capabilities.providers],
    descriptor: result.descriptor,
  };
}
