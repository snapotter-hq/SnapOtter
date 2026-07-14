import { createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type OcrRuntimeTarget = "linux-amd64-cpu-py312" | "linux-arm64-cpu-py311";

export interface OcrRuntimeTrustKey {
  keyId: string;
  algorithm: "ed25519";
  publicKey: string;
}

export interface VerifiedOcrRuntimeIndex {
  artifact: Record<string, unknown>;
  canonicalIndex: Buffer;
  archiveFile: string;
  archiveSha256: string;
  archiveSize: number;
  archiveExpandedSize: number;
  minimumMemoryBytes: number;
}

export const OCR_RUNTIME_INDEX_MAX_BYTES = 16 * 1024 * 1024;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_COMPONENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROJECT_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

/** Canonical representation shared with install_runtime.py and release signing. */
export function canonicalRuntimeJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value))}\n`;
}

/** Resolve either the image-pinned release key or an operator-supplied trust store. */
export function loadOcrRuntimeTrustKeys(path?: string): OcrRuntimeTrustKey[] {
  if (!path) {
    const keyId = process.env.OCR_RUNTIME_INDEX_KEY_ID;
    const encodedPublicKey = process.env.OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64;
    if (keyId || encodedPublicKey) {
      if (
        !keyId ||
        !SAFE_COMPONENT_PATTERN.test(keyId) ||
        !encodedPublicKey ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encodedPublicKey)
      ) {
        throw new Error("OCR runtime trust environment is incomplete or invalid");
      }
      const decoded = Buffer.from(encodedPublicKey, "base64");
      if (decoded.toString("base64") !== encodedPublicKey) {
        throw new Error("OCR runtime public key is not canonical base64");
      }
      return [{ keyId, algorithm: "ed25519", publicKey: decoded.toString("utf8") }];
    }
  }

  const trustPath = path ?? join(PROJECT_ROOT, "docker", "ocr-runtime-trust.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(trustPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read the OCR runtime trust store at ${trustPath}`, { cause: error });
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !Array.isArray(parsed.keys)) {
    throw new Error("OCR runtime trust store uses an unsupported schema");
  }
  const keys: OcrRuntimeTrustKey[] = [];
  const seen = new Set<string>();
  for (const value of parsed.keys) {
    if (
      !isRecord(value) ||
      typeof value.keyId !== "string" ||
      !SAFE_COMPONENT_PATTERN.test(value.keyId) ||
      value.algorithm !== "ed25519" ||
      typeof value.publicKey !== "string" ||
      !value.publicKey
    ) {
      throw new Error("OCR runtime trust store contains an invalid key");
    }
    if (seen.has(value.keyId)) throw new Error(`Duplicate OCR runtime trust key: ${value.keyId}`);
    seen.add(value.keyId);
    keys.push({
      keyId: value.keyId,
      algorithm: "ed25519",
      publicKey: value.publicKey,
    });
  }
  if (keys.length === 0) throw new Error("OCR runtime trust store contains no keys");
  return keys;
}

function safeRelativeReleasePath(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")) {
    throw new Error(`OCR runtime index contains an invalid ${label}`);
  }
  const parts = value.split("/");
  if (
    value.startsWith("/") ||
    value.endsWith("/") ||
    parts.some((part) => !SAFE_COMPONENT_PATTERN.test(part)) ||
    value.includes("://")
  ) {
    throw new Error(`OCR runtime index contains an unsafe ${label}`);
  }
  return parts.join("/");
}

function decodeSignature(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error("OCR runtime index contains an invalid signature encoding");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== value) {
    throw new Error("OCR runtime index contains an invalid Ed25519 signature");
  }
  return decoded;
}

/** Authenticate a canonical release index and select its one compatible OCR artifact. */
export function verifyRuntimeIndex(
  raw: Buffer,
  target: OcrRuntimeTarget,
  trustKeys: readonly OcrRuntimeTrustKey[],
  snapotterVersion: string,
): VerifiedOcrRuntimeIndex {
  if (raw.length === 0 || raw.length > OCR_RUNTIME_INDEX_MAX_BYTES) {
    throw new Error("OCR runtime index exceeds its size limit");
  }
  if (raw.some((byte) => byte > 0x7f)) {
    throw new Error("OCR runtime index metadata must be canonical ASCII JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new Error("OCR runtime index is not valid JSON", { cause: error });
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    throw new Error("OCR runtime index uses an unsupported schema");
  }
  if (!raw.equals(Buffer.from(canonicalRuntimeJson(parsed)))) {
    throw new Error("OCR runtime index is not canonical JSON");
  }

  const signature = parsed.signature;
  if (
    !isRecord(signature) ||
    typeof signature.keyId !== "string" ||
    signature.algorithm !== "ed25519"
  ) {
    throw new Error("OCR runtime index has an invalid signature envelope");
  }
  const trustKey = trustKeys.find(
    (candidate) =>
      candidate.keyId === signature.keyId && candidate.algorithm === signature.algorithm,
  );
  if (!trustKey) {
    throw new Error(`OCR runtime index key "${signature.keyId}" is not trusted`);
  }

  const unsigned = { ...parsed };
  delete unsigned.signature;
  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey(trustKey.publicKey);
  } catch (error) {
    throw new Error(`Trusted OCR runtime key "${trustKey.keyId}" is invalid`, { cause: error });
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error(`Trusted OCR runtime key "${trustKey.keyId}" is not Ed25519`);
  }
  const valid = verify(
    null,
    Buffer.from(canonicalRuntimeJson(unsigned)),
    publicKey,
    decodeSignature(signature.value),
  );
  if (!valid) throw new Error("OCR runtime index signature verification failed");

  if (!Array.isArray(parsed.artifacts)) {
    throw new Error("OCR runtime index artifacts must be an array");
  }
  const matches = parsed.artifacts.filter(
    (artifact): artifact is Record<string, unknown> =>
      isRecord(artifact) && artifact.family === "ocr" && artifact.target === target,
  );
  if (matches.length !== 1) {
    throw new Error(`OCR runtime index must contain exactly one artifact for ocr/${target}`);
  }
  const artifact = matches[0];
  const compatibility = artifact.compatibility;
  if (
    !isRecord(compatibility) ||
    compatibility.protocolVersion !== 1 ||
    compatibility.snapotterVersion !== snapotterVersion ||
    artifact.version !== snapotterVersion
  ) {
    throw new Error(
      `OCR runtime artifact version is incompatible with SnapOtter ${snapotterVersion}`,
    );
  }
  const expectedArch = target === "linux-amd64-cpu-py312" ? "amd64" : "arm64";
  if (artifact.platform !== "linux" || artifact.arch !== expectedArch) {
    throw new Error("OCR runtime artifact platform does not match the selected target");
  }
  const capabilities = artifact.capabilities;
  if (
    !isRecord(capabilities) ||
    !Array.isArray(capabilities.qualities) ||
    capabilities.qualities.length !== 2 ||
    !capabilities.qualities.includes("balanced") ||
    !capabilities.qualities.includes("best") ||
    !Array.isArray(capabilities.providers) ||
    capabilities.providers.length !== 1 ||
    capabilities.providers[0] !== "CPUExecutionProvider"
  ) {
    throw new Error("OCR runtime artifact declares unsupported capabilities");
  }
  const resources = artifact.resources;
  if (
    !isRecord(resources) ||
    typeof resources.minimumMemoryBytes !== "number" ||
    !Number.isSafeInteger(resources.minimumMemoryBytes) ||
    resources.minimumMemoryBytes <= 0
  ) {
    throw new Error("OCR runtime artifact has an invalid minimum memory requirement");
  }
  const archive = artifact.archive;
  if (!isRecord(archive)) throw new Error("OCR runtime artifact has no archive metadata");
  const archiveFile = safeRelativeReleasePath(archive.file, "archive file");
  if (typeof archive.sha256 !== "string" || !SHA256_PATTERN.test(archive.sha256)) {
    throw new Error("OCR runtime artifact has an invalid archive digest");
  }
  if (
    typeof archive.size !== "number" ||
    !Number.isSafeInteger(archive.size) ||
    archive.size <= 0
  ) {
    throw new Error("OCR runtime artifact has an invalid archive size");
  }
  if (
    typeof archive.expandedSize !== "number" ||
    !Number.isSafeInteger(archive.expandedSize) ||
    archive.expandedSize < 0
  ) {
    throw new Error("OCR runtime artifact has an invalid expanded archive size");
  }

  return {
    artifact,
    canonicalIndex: raw,
    archiveFile,
    archiveSha256: archive.sha256,
    archiveSize: archive.size,
    archiveExpandedSize: archive.expandedSize,
    minimumMemoryBytes: resources.minimumMemoryBytes,
  };
}
