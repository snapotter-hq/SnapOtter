import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  type VerifierFixtures,
  verifyInstalledAiProduction,
} from "../../qa/verify-installed-ai-production.mjs";

interface FakeServerOptions {
  artifactMime?: string;
  blurIsUnchanged?: boolean;
  failTool?: string;
  hangLogin?: boolean;
  installFailure?: boolean;
  preinstalled?: boolean;
  processedSizeDelta?: number;
  progressContentType?: string;
  untrustedDownload?: boolean;
  wrongProgressJob?: boolean;
}

let fixtures: VerifierFixtures;
let artifacts: Record<string, { body: Buffer; contentType: string }>;
let unblurredWebp: Buffer;

beforeAll(async () => {
  const pixels = Buffer.alloc(200 * 200 * 3);
  for (let y = 0; y < 200; y += 1) {
    for (let x = 0; x < 200; x += 1) {
      const offset = (y * 200 + x) * 3;
      const background = (x + y) % 2 === 0 ? 20 : 230;
      const subject = x >= 80 && x < 120 && y >= 66 && y < 146;
      pixels[offset] = subject ? 32 : background;
      pixels[offset + 1] = subject ? 128 : background;
      pixels[offset + 2] = subject ? 224 : background;
    }
  }
  const portrait = await sharp(pixels, { raw: { width: 200, height: 200, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();
  const subject = await sharp(portrait)
    .extract({ left: 80, top: 66, width: 40, height: 80 })
    .png()
    .toBuffer();
  const blurred = await sharp(portrait)
    .blur(12)
    .composite([{ input: subject, left: 80, top: 66 }])
    .webp({ lossless: true })
    .toBuffer();
  // A visible brightness shift changes decoded border pixels and file bytes,
  // but deliberately preserves background high-frequency detail.
  unblurredWebp = await sharp(portrait).linear(1, 20).webp({ lossless: true }).toBuffer();
  const replaced = await sharp({
    create: { width: 200, height: 200, channels: 3, background: "#ff0000" },
  })
    .composite([{ input: subject, left: 80, top: 66 }])
    .png()
    .toBuffer();
  fixtures = {
    portrait,
    speechMp4: Buffer.from("fake speech video"),
    speechWav: Buffer.from("fake speech audio"),
  };
  artifacts = {
    "transcribe-audio": {
      body: Buffer.from("The quick brown fox transcribes audio files reliably."),
      contentType: "text/plain",
    },
    "auto-subtitles": {
      body: Buffer.from(
        "1\n00:00:00,000 --> 00:00:02,000\nThe quick brown fox transcribes audio.\n",
      ),
      contentType: "application/x-subrip",
    },
    "blur-background": { body: blurred, contentType: "image/webp" },
    "background-replace": { body: replaced, contentType: "image/png" },
  };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createFakeServer(options: FakeServerOptions = {}): typeof fetch {
  const installed = options.preinstalled ?? false;
  let installRequests = 0;
  const jobTools = new Map<string, string>();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/api/auth/login") {
      if (options.hangLogin) {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          const rejectAbort = () => reject(new Error("request aborted"));
          if (signal?.aborted) rejectAbort();
          else signal?.addEventListener("abort", rejectAbort, { once: true });
        });
      }
      return json({ token: "admin-token" });
    }
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-token");

    if (url.pathname === "/api/v1/features") {
      const status = installed || installRequests === 2 ? "installed" : "not_installed";
      return json({
        bundles: [
          { id: "transcription", status },
          {
            id: "background-removal",
            status: options.installFailure && installRequests === 2 ? "error" : status,
            error: options.installFailure ? "bundle checksum mismatch" : null,
          },
        ],
      });
    }
    const install = url.pathname.match(/^\/api\/v1\/admin\/features\/([^/]+)\/install$/u);
    if (install) {
      installRequests += 1;
      return json({ jobId: `install-${install[1]}`, queued: installRequests > 1 }, 202);
    }

    const submittedTool = Object.keys(artifacts).find((toolId) => url.pathname.endsWith(toolId));
    if (submittedTool) {
      const jobId = `job-${submittedTool}`;
      jobTools.set(jobId, submittedTool);
      return json({ jobId, async: true }, 202);
    }
    const progress = url.pathname.match(/^\/api\/v1\/jobs\/([^/]+)\/progress$/u);
    if (progress) {
      const jobId = decodeURIComponent(progress[1]);
      const toolId = jobTools.get(jobId);
      if (!toolId) return json({ error: "unknown job" }, 404);
      const artifact = artifacts[toolId];
      const body =
        options.blurIsUnchanged && toolId === "blur-background" ? unblurredWebp : artifact.body;
      const frame =
        options.failTool === toolId
          ? {
              jobId,
              type: "single",
              phase: "failed",
              error: "worker exploded",
            }
          : {
              jobId: options.wrongProgressJob ? "different-job" : jobId,
              type: "single",
              phase: "complete",
              result: {
                downloadUrl: options.untrustedDownload
                  ? `https://attacker.invalid/api/v1/download/${jobId}/output.bin`
                  : `/api/v1/download/${jobId}/output.bin`,
                processedSize: body.length + (options.processedSizeDelta ?? 0),
              },
            };
      return new Response(`data: ${JSON.stringify(frame)}\n\n`, {
        headers: { "content-type": options.progressContentType ?? "text/event-stream" },
      });
    }
    const download = url.pathname.match(/^\/api\/v1\/download\/([^/]+)\/output\.bin$/u);
    if (download) {
      const toolId = jobTools.get(decodeURIComponent(download[1]));
      if (!toolId) return json({ error: "unknown artifact" }, 404);
      const source = artifacts[toolId];
      const body =
        options.blurIsUnchanged && toolId === "blur-background" ? unblurredWebp : source.body;
      return new Response(new Uint8Array(body), {
        headers: { "content-type": options.artifactMime ?? source.contentType },
      });
    }
    return json({ error: `unhandled ${url.pathname}` }, 404);
  }) as typeof fetch;
}

function verify(fetchImpl: typeof fetch): Promise<void> {
  return verifyInstalledAiProduction({
    baseUrl: "http://127.0.0.1:13499",
    username: "admin",
    password: "test-password",
    fetchImpl,
    fixtures,
    installPollMs: 1,
    installTimeoutMs: 100,
    jobTimeoutMs: 100,
    requestTimeoutMs: 50,
    sleep: async () => {},
  });
}

describe("production installed-AI verifier", () => {
  it("installs both real bundles and verifies all four downloaded artifacts", async () => {
    const fetchImpl = createFakeServer();

    await expect(verify(fetchImpl)).resolves.toBeUndefined();

    const requested = vi.mocked(fetchImpl).mock.calls.map(([input]) => String(input));
    expect(
      requested.filter((url) => url.includes("/admin/features/") && url.endsWith("/install")),
    ).toHaveLength(2);
    expect(
      requested.filter((url) => url.includes("/jobs/") && url.endsWith("/progress")),
    ).toHaveLength(4);
    expect(requested.filter((url) => url.includes("/download/"))).toHaveLength(4);
    for (const [, init] of vi.mocked(fetchImpl).mock.calls) {
      expect(init?.redirect).toBe("error");
    }
  });

  it("fails when the fresh production volume already claims bundles are installed", async () => {
    await expect(verify(createFakeServer({ preinstalled: true }))).rejects.toThrow(
      "fresh production data unexpectedly reports transcription as installed",
    );
  });

  it("fails closed on a terminal worker failure", async () => {
    await expect(verify(createFakeServer({ failTool: "auto-subtitles" }))).rejects.toThrow(
      "job failed: worker exploded",
    );
  });

  it("fails closed when bundle installation reports an error", async () => {
    await expect(verify(createFakeServer({ installFailure: true }))).rejects.toThrow(
      "background-removal install failed: bundle checksum mismatch",
    );
  });

  it("rejects non-SSE progress responses and wrong-job frames", async () => {
    await expect(
      verify(createFakeServer({ progressContentType: "application/json" })),
    ).rejects.toThrow("job progress MIME mismatch");
    await expect(verify(createFakeServer({ wrongProgressJob: true }))).rejects.toThrow(
      "wrong job or job type",
    );
  });

  it("rejects cross-origin downloads, MIME drift, and processed-size drift", async () => {
    await expect(verify(createFakeServer({ untrustedDownload: true }))).rejects.toThrow(
      "untrusted download URL",
    );
    await expect(
      verify(createFakeServer({ artifactMime: "application/octet-stream" })),
    ).rejects.toThrow("artifact MIME mismatch");
    await expect(verify(createFakeServer({ processedSizeDelta: 1 }))).rejects.toThrow(
      "artifact size does not match",
    );
  });

  it("bounds non-SSE HTTP requests", async () => {
    await expect(verify(createFakeServer({ hangLogin: true }))).rejects.toThrow(
      "admin login timed out after 50ms",
    );
  });

  it("fails when blur changes bytes but does not reduce background energy", async () => {
    await expect(verify(createFakeServer({ blurIsUnchanged: true }))).rejects.toThrow(
      "background high-frequency energy ratio",
    );
  });
});
