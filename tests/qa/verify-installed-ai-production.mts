import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { apiToolPath } from "../../packages/shared/src/constants.js";
import {
  expectBackgroundBlurEnergyReduced,
  expectConfiguredBackground,
  expectForegroundPreserved,
  expectKnownTranscript,
  expectObservablePixelChange,
  expectSrtArtifact,
} from "../helpers/installed-ai-output-oracles.js";

const REQUIRED_BUNDLES = ["transcription", "background-removal"] as const;

interface BundleState {
  error?: string | null;
  id: string;
  status: string;
}

interface TerminalResult {
  downloadUrl?: string;
  processedSize?: number;
}

interface TerminalFrame {
  error?: string;
  jobId?: string;
  phase?: string;
  result?: TerminalResult;
  type?: string;
}

export interface VerifierFixtures {
  portrait: Buffer;
  speechMp4: Buffer;
  speechWav: Buffer;
}

export interface InstalledAiVerifierOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  fixtures?: VerifierFixtures;
  installPollMs?: number;
  installTimeoutMs?: number;
  jobTimeoutMs?: number;
  password: string;
  requestTimeoutMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  username: string;
}

interface ToolSpec {
  contentType: string;
  file: Buffer;
  filename: string;
  settings: Record<string, unknown>;
  toolId: string;
  verify: (output: Buffer) => Promise<void> | void;
}

function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} returned a non-object payload`);
  }
  return value as Record<string, unknown>;
}

async function responseJson(response: Response, context: string): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  try {
    return assertRecord(JSON.parse(body), context);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${context} returned invalid JSON`);
    throw error;
  }
}

async function withRequestTimeout<T>(
  timeoutMs: number,
  context: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`${context} timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  context: string,
): Promise<{ payload: Record<string, unknown>; response: Response }> {
  return withRequestTimeout(timeoutMs, context, async (signal) => {
    const response = await fetchImpl(url, { ...init, redirect: "error", signal });
    const payload = await responseJson(response, context);
    return { payload, response };
  });
}

async function loadFixtures(): Promise<VerifierFixtures> {
  const [portrait, speechMp4, speechWav] = await Promise.all([
    readFile("tests/fixtures/image/valid/portrait-color.jpg"),
    readFile("tests/fixtures/video/valid/speech-10s.mp4"),
    readFile("tests/fixtures/audio/valid/speech-10s.wav"),
  ]);
  return { portrait, speechMp4, speechWav };
}

function authHeaders(token: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("authorization", `Bearer ${token}`);
  return headers;
}

async function readTerminalFrame(
  fetchImpl: typeof fetch,
  url: string,
  token: string,
  timeoutMs: number,
  expectedJobId: string,
): Promise<TerminalFrame> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetchImpl(url, {
      headers: authHeaders(token),
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status !== 200 || !response.body) {
      throw new Error(`job progress failed with HTTP ${response.status}`);
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0];
    if (contentType !== "text/event-stream") {
      throw new Error(`job progress MIME mismatch: ${contentType || "missing"}`);
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        let frame: TerminalFrame;
        try {
          frame = assertRecord(JSON.parse(line.slice(5).trim()), "job progress") as TerminalFrame;
        } catch {
          throw new Error("job progress emitted malformed JSON");
        }
        if (frame.type === "heartbeat") continue;
        if (frame.type !== "single" || frame.jobId !== expectedJobId) {
          throw new Error("job progress emitted a frame for the wrong job or job type");
        }
        if (frame.phase === "failed") {
          throw new Error(`job failed: ${frame.error || "unknown worker error"}`);
        }
        if (frame.phase === "complete") return frame;
      }
      if (done) throw new Error("job progress stream ended before a terminal frame");
    }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`job progress timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
  }
}

async function listBundles(
  fetchImpl: typeof fetch,
  baseUrl: string,
  token: string,
  requestTimeoutMs: number,
): Promise<BundleState[]> {
  const { payload } = await requestJson(
    fetchImpl,
    `${baseUrl}/api/v1/features`,
    { headers: authHeaders(token) },
    requestTimeoutMs,
    "feature inventory",
  );
  const bundles = payload.bundles;
  if (!Array.isArray(bundles)) throw new Error("feature inventory omitted bundles");
  return bundles.map((bundle, index) => {
    const record = assertRecord(bundle, `feature inventory bundle ${index}`);
    if (typeof record.id !== "string" || typeof record.status !== "string") {
      throw new Error(`feature inventory bundle ${index} has invalid identity`);
    }
    return {
      id: record.id,
      status: record.status,
      error: typeof record.error === "string" ? record.error : null,
    };
  });
}

async function installRealBundles(
  fetchImpl: typeof fetch,
  baseUrl: string,
  token: string,
  options: Required<
    Pick<
      InstalledAiVerifierOptions,
      "installPollMs" | "installTimeoutMs" | "requestTimeoutMs" | "sleep"
    >
  >,
): Promise<void> {
  const initial = await listBundles(fetchImpl, baseUrl, token, options.requestTimeoutMs);
  for (const bundleId of REQUIRED_BUNDLES) {
    const bundle = initial.find((candidate) => candidate.id === bundleId);
    if (!bundle) throw new Error(`feature inventory omitted required bundle ${bundleId}`);
    if (bundle.status !== "not_installed") {
      throw new Error(`fresh production data unexpectedly reports ${bundleId} as ${bundle.status}`);
    }
  }

  for (const bundleId of REQUIRED_BUNDLES) {
    const { payload, response } = await requestJson(
      fetchImpl,
      `${baseUrl}/api/v1/admin/features/${bundleId}/install`,
      { method: "POST", headers: authHeaders(token) },
      options.requestTimeoutMs,
      `${bundleId} install`,
    );
    if (response.status !== 202 || typeof payload.jobId !== "string" || !payload.jobId) {
      throw new Error(`${bundleId} install did not return a 202 job identity`);
    }
  }

  const deadline = Date.now() + options.installTimeoutMs;
  while (true) {
    const inventory = await listBundles(fetchImpl, baseUrl, token, options.requestTimeoutMs);
    let installed = 0;
    for (const bundleId of REQUIRED_BUNDLES) {
      const bundle = inventory.find((candidate) => candidate.id === bundleId);
      if (!bundle) throw new Error(`feature inventory omitted required bundle ${bundleId}`);
      if (bundle.status === "error" || bundle.status === "incompatible") {
        throw new Error(`${bundleId} install failed: ${bundle.error || bundle.status}`);
      }
      if (bundle.status === "installed") installed += 1;
    }
    if (installed === REQUIRED_BUNDLES.length) return;
    if (Date.now() >= deadline) {
      throw new Error(`AI bundle installation timed out after ${options.installTimeoutMs}ms`);
    }
    await options.sleep(options.installPollMs);
  }
}

async function runTool(
  fetchImpl: typeof fetch,
  baseUrl: string,
  token: string,
  timeoutMs: number,
  requestTimeoutMs: number,
  spec: ToolSpec,
): Promise<void> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(spec.file)], { type: spec.contentType }),
    spec.filename,
  );
  form.append("settings", JSON.stringify(spec.settings));
  const { payload: accepted, response } = await requestJson(
    fetchImpl,
    `${baseUrl}${apiToolPath(spec.toolId)}`,
    { method: "POST", headers: authHeaders(token), body: form },
    requestTimeoutMs,
    `${spec.toolId} submission`,
  );
  if (response.status !== 202 || typeof accepted.jobId !== "string" || !accepted.jobId) {
    throw new Error(`${spec.toolId} did not return a 202 job identity`);
  }

  const jobId = accepted.jobId;
  const terminal = await readTerminalFrame(
    fetchImpl,
    `${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}/progress`,
    token,
    timeoutMs,
    jobId,
  );
  const downloadUrl = terminal.result?.downloadUrl;
  if (typeof downloadUrl !== "string" || !downloadUrl) {
    throw new Error(`${spec.toolId} terminal result omitted downloadUrl`);
  }
  const base = new URL(baseUrl);
  const download = new URL(downloadUrl, base);
  const expectedPrefix = `/api/v1/download/${encodeURIComponent(jobId)}/`;
  if (
    download.origin !== base.origin ||
    download.username !== "" ||
    download.password !== "" ||
    download.search !== "" ||
    download.hash !== "" ||
    !download.pathname.startsWith(expectedPrefix)
  ) {
    throw new Error(`${spec.toolId} returned an untrusted download URL`);
  }
  const artifact = await withRequestTimeout(
    requestTimeoutMs,
    `${spec.toolId} artifact download`,
    async (signal) => {
      const artifactResponse = await fetchImpl(download, {
        headers: authHeaders(token),
        redirect: "error",
        signal,
      });
      if (!artifactResponse.ok) {
        throw new Error(
          `${spec.toolId} artifact download failed with HTTP ${artifactResponse.status}`,
        );
      }
      const expectedType =
        spec.toolId === "transcribe-audio"
          ? "text/plain"
          : spec.toolId === "auto-subtitles"
            ? "application/x-subrip"
            : spec.toolId === "blur-background"
              ? "image/webp"
              : "image/png";
      const actualType = (artifactResponse.headers.get("content-type") ?? "").split(";", 1)[0];
      if (actualType !== expectedType) {
        throw new Error(`${spec.toolId} artifact MIME mismatch: ${actualType || "missing"}`);
      }
      return Buffer.from(await artifactResponse.arrayBuffer());
    },
  );
  if (artifact.length === 0) throw new Error(`${spec.toolId} returned an empty artifact`);
  if (
    typeof terminal.result?.processedSize !== "number" ||
    terminal.result.processedSize !== artifact.length
  ) {
    throw new Error(`${spec.toolId} artifact size does not match the terminal result`);
  }
  await spec.verify(artifact);
}

export async function verifyInstalledAiProduction(
  options: InstalledAiVerifierOptions,
): Promise<void> {
  const baseUrl = options.baseUrl.replace(/\/$/u, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const fixtures = options.fixtures ?? (await loadFixtures());
  const requestTimeoutMs = options.requestTimeoutMs ?? 60_000;
  const { payload: login } = await requestJson(
    fetchImpl,
    `${baseUrl}/api/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: options.username, password: options.password }),
    },
    requestTimeoutMs,
    "admin login",
  );
  if (typeof login.token !== "string" || !login.token) {
    throw new Error("admin login omitted bearer token");
  }
  const token = login.token;

  await installRealBundles(fetchImpl, baseUrl, token, {
    installPollMs: options.installPollMs ?? 10_000,
    installTimeoutMs: options.installTimeoutMs ?? 2 * 60 * 60_000,
    requestTimeoutMs,
    sleep:
      options.sleep ??
      ((delayMs) => new Promise((resolveSleep) => setTimeout(resolveSleep, delayMs))),
  });

  const toolSpecs: ToolSpec[] = [
    {
      toolId: "transcribe-audio",
      file: fixtures.speechWav,
      filename: "speech-10s.wav",
      contentType: "audio/wav",
      settings: { language: "auto", outputFormat: "txt" },
      verify: (artifact) => expectKnownTranscript(artifact.toString("utf8")),
    },
    {
      toolId: "auto-subtitles",
      file: fixtures.speechMp4,
      filename: "speech-10s.mp4",
      contentType: "video/mp4",
      settings: { language: "auto", format: "srt" },
      verify: (artifact) => {
        const subtitles = artifact.toString("utf8");
        expectSrtArtifact(subtitles);
        expectKnownTranscript(subtitles);
      },
    },
    {
      toolId: "blur-background",
      file: fixtures.portrait,
      filename: "portrait-color.jpg",
      contentType: "image/jpeg",
      settings: { intensity: 75, feather: 3, format: "webp" },
      verify: async (artifact) => {
        await expectObservablePixelChange(fixtures.portrait, artifact);
        await expectBackgroundBlurEnergyReduced(fixtures.portrait, artifact);
        await expectForegroundPreserved(fixtures.portrait, artifact);
      },
    },
    {
      toolId: "background-replace",
      file: fixtures.portrait,
      filename: "portrait-color.jpg",
      contentType: "image/jpeg",
      settings: { backgroundType: "color", color: "#ff0000", format: "png" },
      verify: async (artifact) => {
        await expectObservablePixelChange(fixtures.portrait, artifact);
        await expectConfiguredBackground(artifact, "solid-red");
        await expectForegroundPreserved(fixtures.portrait, artifact);
      },
    },
  ];

  for (const spec of toolSpecs) {
    await runTool(
      fetchImpl,
      baseUrl,
      token,
      options.jobTimeoutMs ?? 20 * 60_000,
      requestTimeoutMs,
      spec,
    );
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  verifyInstalledAiProduction({
    baseUrl: requiredEnv("QA_BASE_URL"),
    username: requiredEnv("QA_USERNAME"),
    password: requiredEnv("QA_PASSWORD"),
  })
    .then(() => {
      process.stdout.write("Verified installed transcription and background-removal outputs.\n");
    })
    .catch((error) => {
      process.stderr.write(`Installed AI verification failed: ${String(error)}\n`);
      process.exitCode = 1;
    });
}
