#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";
import { assertOracle } from "./oracles.mjs";

const MIN_ARTIFACT_BYTES = 16;
const SUPPORTED_EXACT_MIMES = new Set([
  "application/json",
  "application/pdf",
  "application/zip",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/epub+zip",
  "application/vnd.apple.mpegurl",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/aac",
  "audio/flac",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-wav",
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/tiff",
  "image/vnd.microsoft.icon",
  "image/webp",
  "image/x-icon",
  "video/mp4",
  "video/ogg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
]);

function normalizeMime(value) {
  return String(value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

function startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes, start, end) {
  return bytes.subarray(start, end).toString("latin1");
}

function assertExpectedMime(actualMime, expectedMime) {
  if (!expectedMime) return;
  const allowed = String(expectedMime).split(",").map(normalizeMime).filter(Boolean);
  const matches = allowed.some((candidate) =>
    candidate.endsWith("/*")
      ? actualMime.startsWith(candidate.slice(0, -1))
      : actualMime === candidate,
  );
  if (!matches) throw new Error(`expected ${allowed.join(" or ")} but received ${actualMime}`);
}

function assertSuccessfulJson(payload, label) {
  if (!payload || typeof payload !== "object") throw new Error(`${label} is not a JSON object`);
  if (payload.success === false || payload.error !== undefined) {
    throw new Error(`${label} reported failure: ${errorMessage(payload.error)}`);
  }
}

function validatedZipEntries(bytes) {
  try {
    const archive = new AdmZip(bytes);
    const entries = archive.getEntries();
    if (entries.length === 0) throw new Error("archive has no entries");
    for (const entry of entries) {
      if (!entry.isDirectory) entry.getData();
    }
    return entries;
  } catch (error) {
    throw new Error(`ZIP is invalid: ${errorMessage(error)}`);
  }
}

export function validateArtifact(output, contentType, options = {}) {
  const bytes = Buffer.from(output);
  let mime = normalizeMime(contentType);
  if (bytes.length < MIN_ARTIFACT_BYTES) {
    throw new Error(`artifact is trivial (${bytes.length} bytes)`);
  }

  if (!mime || mime === "application/octet-stream") {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) mime = "image/png";
    else if (startsWith(bytes, [0xff, 0xd8, 0xff])) mime = "image/jpeg";
    else if (ascii(bytes, 0, 4) === "%PDF") mime = "application/pdf";
    else if (ascii(bytes, 0, 2) === "PK") mime = "application/zip";
    else throw new Error("artifact MIME is missing or generic and magic is unknown");
  }

  if (!SUPPORTED_EXACT_MIMES.has(mime) && !mime.startsWith("text/")) {
    throw new Error(`unsupported artifact MIME: ${mime}`);
  }
  assertExpectedMime(mime, options.expectedMime);

  const magicChecks = [
    [mime === "image/png", startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]), "PNG"],
    [mime === "image/jpeg", startsWith(bytes, [0xff, 0xd8, 0xff]), "JPEG"],
    [mime === "image/gif", ascii(bytes, 0, 4) === "GIF8", "GIF"],
    [
      mime === "image/webp",
      ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP",
      "WebP",
    ],
    [mime === "image/bmp", ascii(bytes, 0, 2) === "BM", "BMP"],
    [mime === "image/tiff", ["II*\0", "MM\0*"].includes(ascii(bytes, 0, 4)), "TIFF"],
    [
      mime === "image/x-icon" || mime === "image/vnd.microsoft.icon",
      startsWith(bytes, [0, 0, 1, 0]),
      "ICO",
    ],
    [mime === "application/pdf", ascii(bytes, 0, 4) === "%PDF", "PDF"],
    [mime === "application/zip", ascii(bytes, 0, 2) === "PK", "ZIP"],
    [
      mime === "audio/wav" || mime === "audio/x-wav",
      ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE",
      "WAV",
    ],
    [mime === "audio/flac", ascii(bytes, 0, 4) === "fLaC", "FLAC"],
    [mime === "audio/ogg" || mime === "video/ogg", ascii(bytes, 0, 4) === "OggS", "Ogg"],
    [
      mime === "video/webm" || mime === "audio/webm",
      startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]),
      "WebM",
    ],
    [
      mime === "video/mp4" ||
        mime === "audio/mp4" ||
        mime === "image/avif" ||
        mime === "image/heic" ||
        mime === "image/heif",
      ascii(bytes, 4, 8) === "ftyp",
      "ISO BMFF",
    ],
  ];
  for (const [applies, valid, label] of magicChecks) {
    if (applies && !valid) throw new Error(`${label} magic mismatch for ${mime}`);
  }

  if (mime === "image/jpeg" && !startsWith(bytes, [0xff, 0xd9], bytes.length - 2)) {
    throw new Error("JPEG is truncated or missing its end marker");
  }
  if (mime === "image/png" && ascii(bytes, bytes.length - 8, bytes.length - 4) !== "IEND") {
    throw new Error("PNG is truncated or missing its IEND chunk");
  }
  if (mime === "image/gif" && bytes[bytes.length - 1] !== 0x3b) {
    throw new Error("GIF is truncated or missing its trailer");
  }
  if (mime === "application/pdf" && !/%%EOF\s*$/.test(bytes.toString("latin1"))) {
    throw new Error("PDF is truncated or missing %%EOF");
  }
  if (mime === "application/zip" || mime.endsWith("+zip") || mime.includes("openxmlformats")) {
    const entries = validatedZipEntries(bytes);
    const files = entries.filter((entry) => !entry.isDirectory);
    if (options.expectedZipEntries !== undefined && files.length !== options.expectedZipEntries) {
      throw new Error(
        `expected ${options.expectedZipEntries} ZIP entries but received ${files.length}`,
      );
    }
    if (options.oracle?.zipEach) {
      for (const entry of files) {
        try {
          assertOracle(entry.getData(), options.oracle.zipEach);
        } catch (error) {
          throw new Error(`ZIP entry ${entry.entryName}: ${errorMessage(error)}`);
        }
      }
    }
  }

  if (mime === "audio/mpeg") {
    const mp3 = ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    if (!mp3) throw new Error("MP3 magic mismatch for audio/mpeg");
  }
  if (mime === "application/json") {
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("JSON artifact is not valid JSON");
    }
    assertSuccessfulJson(payload, "JSON artifact");
  }
  if (mime === "image/svg+xml" && !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(bytes.toString("utf8"))) {
    throw new Error("SVG magic mismatch for image/svg+xml");
  }
  if (mime.startsWith("text/") && bytes.toString("utf8").trim().length === 0) {
    throw new Error(`text artifact is empty for ${mime}`);
  }

  assertOracle(bytes, options.oracle);

  return { output: bytes, outputMime: mime, outputSize: bytes.length };
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function sameOriginUrl(baseUrl, candidate, label) {
  const base = new URL(baseUrl);
  const resolved = new URL(candidate, base);
  if (resolved.origin !== base.origin)
    throw new Error(`cross-origin ${label} URL: ${resolved.href}`);
  return resolved;
}

function assertFinalResponseOrigin(baseUrl, response, label) {
  if (!response.url) return;
  const base = new URL(baseUrl);
  const final = new URL(response.url);
  if (final.origin !== base.origin) {
    throw new Error(`cross-origin final ${label} URL: ${final.href}`);
  }
}

function errorMessage(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof value.message === "string") {
    return value.message;
  }
  return value == null ? "unknown error" : JSON.stringify(value);
}

function terminalEventFromBuffer(buffer) {
  let terminal;
  for (const line of buffer.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    let event;
    try {
      event = JSON.parse(line.slice(5).trim());
    } catch {
      continue;
    }
    if (event.phase === "failed" || event.status === "failed") {
      return { kind: "failed", event };
    }
    if (event.phase === "complete" || event.status === "completed") {
      terminal = { kind: "completed", event };
    }
  }
  return terminal;
}

export async function waitForTerminalEvent({ baseUrl, token, jobId, timeoutMs, fetchImpl }) {
  const progressUrl = sameOriginUrl(
    baseUrl,
    `/api/v1/jobs/${encodeURIComponent(jobId)}/progress`,
    "progress",
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(progressUrl, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`job ${jobId} progress returned HTTP ${response.status}`);
    }
    assertFinalResponseOrigin(baseUrl, response, "progress");
    const progressMime = normalizeMime(response.headers.get("content-type"));
    if (progressMime !== "text/event-stream") {
      throw new Error(`job ${jobId} progress returned unsupported content-type ${progressMime}`);
    }

    let buffer = "";
    for await (const chunk of response.body) {
      buffer += Buffer.from(chunk).toString("utf8");
      const terminal = terminalEventFromBuffer(buffer);
      if (!terminal) continue;
      if (terminal.kind === "failed") {
        throw new Error(`job ${jobId} failed: ${errorMessage(terminal.event.error)}`);
      }
      return terminal.event;
    }
    throw new Error(`job ${jobId} progress ended without a terminal event`);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`job ${jobId} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchArtifact({
  baseUrl,
  token,
  downloadUrl,
  timeoutMs,
  fetchImpl,
  expectedMime,
  expectedZipEntries,
  oracle,
}) {
  const url = sameOriginUrl(baseUrl, downloadUrl, "artifact");
  const response = await fetchImpl(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`artifact download returned HTTP ${response.status}`);
  assertFinalResponseOrigin(baseUrl, response, "artifact");
  const output = Buffer.from(await response.arrayBuffer());
  return validateArtifact(output, response.headers.get("content-type"), {
    expectedMime,
    expectedZipEntries,
    oracle,
  });
}

async function fallbackDownloadUrl({ baseUrl, token, jobId, timeoutMs, fetchImpl }) {
  const metaUrl = sameOriginUrl(
    baseUrl,
    `/api/v1/download/${encodeURIComponent(jobId)}/output-meta.json`,
    "output metadata",
  );
  const response = await fetchImpl(metaUrl, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`job ${jobId} completed without a downloadable artifact`);
  assertFinalResponseOrigin(baseUrl, response, "output metadata");
  if (normalizeMime(response.headers.get("content-type")) !== "application/json") {
    throw new Error(`job ${jobId} output metadata is not application/json`);
  }
  const metadata = await response.json();
  if (!metadata || typeof metadata.filename !== "string" || metadata.filename.length === 0) {
    throw new Error(`job ${jobId} output metadata has no filename`);
  }
  return `/api/v1/download/${encodeURIComponent(jobId)}/${encodeURIComponent(metadata.filename)}`;
}

export async function resolveBenchmarkResponse({
  baseUrl,
  token = "",
  admissionStatus,
  admissionMime,
  admissionBody,
  admissionLatencyS = 0,
  timeoutMs = 300_000,
  fetchImpl = globalThis.fetch,
  expectedMime,
  expectedZipEntries,
  oracle,
}) {
  const started = performance.now();
  let artifact;

  if (admissionStatus === 200) {
    if (normalizeMime(admissionMime) === "application/json") {
      const payload = parseJson(admissionBody, "200 response");
      assertSuccessfulJson(payload, "200 response");
      if (typeof payload.downloadUrl === "string") {
        artifact = await fetchArtifact({
          baseUrl,
          token,
          downloadUrl: payload.downloadUrl,
          timeoutMs,
          fetchImpl,
          expectedMime,
          expectedZipEntries,
          oracle,
        });
      } else {
        artifact = validateArtifact(admissionBody, admissionMime, {
          expectedMime,
          expectedZipEntries,
          oracle,
        });
      }
    } else {
      artifact = validateArtifact(admissionBody, admissionMime, {
        expectedMime,
        expectedZipEntries,
        oracle,
      });
    }
  } else if (admissionStatus === 202) {
    const payload = parseJson(admissionBody, "202 response");
    if (typeof payload.jobId !== "string" || payload.jobId.length === 0) {
      throw new Error("202 response has no jobId");
    }
    const terminal = await waitForTerminalEvent({
      baseUrl,
      token,
      jobId: payload.jobId,
      timeoutMs,
      fetchImpl,
    });
    const failedFiles = Number(terminal.failedFiles ?? 0);
    const errors = Array.isArray(terminal.errors) ? terminal.errors : [];
    if (failedFiles > 0 || errors.length > 0) {
      throw new Error(
        `batch ${payload.jobId} completed with ${Math.max(failedFiles, errors.length)} failed file(s)`,
      );
    }
    const totalFiles = Number(terminal.totalFiles);
    const completedFiles = Number(terminal.completedFiles);
    if (
      Number.isFinite(totalFiles) &&
      totalFiles > 0 &&
      (!Number.isFinite(completedFiles) || completedFiles !== totalFiles)
    ) {
      throw new Error(
        `batch ${payload.jobId} completed partially (${completedFiles}/${totalFiles} files)`,
      );
    }
    const nestedResult =
      terminal.result && typeof terminal.result === "object" ? terminal.result : {};
    assertSuccessfulJson(nestedResult, `job ${payload.jobId} terminal result`);
    const artifactJobId =
      typeof payload.artifactJobId === "string" && payload.artifactJobId.length > 0
        ? payload.artifactJobId
        : payload.jobId;
    const downloadUrl =
      typeof terminal.downloadUrl === "string"
        ? terminal.downloadUrl
        : typeof nestedResult.downloadUrl === "string"
          ? nestedResult.downloadUrl
          : await fallbackDownloadUrl({
              baseUrl,
              token,
              jobId: artifactJobId,
              timeoutMs,
              fetchImpl,
            });
    artifact = await fetchArtifact({
      baseUrl,
      token,
      downloadUrl,
      timeoutMs,
      fetchImpl,
      expectedMime,
      expectedZipEntries:
        expectedZipEntries ??
        (Number.isFinite(totalFiles) && totalFiles > 0 ? totalFiles : undefined),
      oracle,
    });
  } else {
    throw new Error(`admission returned HTTP ${admissionStatus}`);
  }

  return {
    admissionStatus,
    completionStatus: "completed",
    completionLatencyS: Number(admissionLatencyS) + (performance.now() - started) / 1_000,
    ...artifact,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined)
      throw new Error(`invalid argument ${key ?? ""}`);
    args[key.slice(2)] = value;
  }
  return args;
}

function safeField(value) {
  return String(value ?? "-").replace(/[\t\r\n]/g, " ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const started = performance.now();
  const admissionStatus = Number(args.status);
  const admissionLatencyS = Number(args["admission-latency"] ?? 0);
  try {
    const result = await resolveBenchmarkResponse({
      baseUrl: args["base-url"],
      token: args.token ?? "",
      admissionStatus,
      admissionMime: args.mime,
      admissionBody: await readFile(args.body),
      admissionLatencyS,
      timeoutMs: Number(args["timeout-ms"] ?? 300_000),
      expectedMime: args["expected-mime"],
      expectedZipEntries:
        args["expected-zip-entries"] === undefined
          ? undefined
          : Number(args["expected-zip-entries"]),
      oracle: args.oracle === undefined ? undefined : JSON.parse(args.oracle),
    });
    if (args.output) await writeFile(args.output, result.output);
    process.stdout.write(
      `${[
        "true",
        result.admissionStatus,
        result.completionStatus,
        result.completionLatencyS.toFixed(3),
        result.outputSize,
        result.outputMime,
        "-",
      ]
        .map(safeField)
        .join("\t")}\n`,
    );
  } catch (error) {
    const latency = admissionLatencyS + (performance.now() - started) / 1_000;
    process.stdout.write(
      `${[
        "false",
        admissionStatus || 0,
        "failed",
        latency.toFixed(3),
        0,
        "unknown",
        errorMessage(error),
      ]
        .map(safeField)
        .join("\t")}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
