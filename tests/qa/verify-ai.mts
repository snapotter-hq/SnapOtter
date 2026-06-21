// Verifies the installed AI models produce CORRECT output (not just run), using
// real-content fixtures. Run: ./apps/api/node_modules/.bin/tsx tests/qa/verify-ai.mts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { apiToolPath } from "@snapotter/shared";

const BASE = "http://localhost:13499";

async function pollSSE(jobId: string, timeoutMs = 240_000): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/api/v1/jobs/${jobId}/progress`);
  if (!res.body) return { error: "no body" };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    // biome-ignore lint/suspicious/noAssignInExpressions: stream parse
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const d = JSON.parse(line.slice(5).trim());
        if (d.phase === "complete" || d.status === "completed") {
          await reader.cancel();
          return d;
        }
        if (d.phase === "failed" || d.status === "failed") {
          await reader.cancel();
          return { failed: true, ...d };
        }
      } catch {
        // partial line
      }
    }
  }
  await reader.cancel();
  return { timeout: true };
}

async function fetchOutput(jobId: string): Promise<Buffer | null> {
  try {
    const meta = await fetch(`${BASE}/api/v1/download/${jobId}/output-meta.json`);
    if (meta.ok) {
      const m = (await meta.json()) as { filename?: string };
      if (m.filename) {
        const dl = await fetch(`${BASE}/api/v1/download/${jobId}/${m.filename}`);
        if (dl.ok) return Buffer.from(await dl.arrayBuffer());
      }
    }
  } catch {
    // fall through
  }
  return null;
}

async function run(toolId: string, file: string, settings: Record<string, unknown>) {
  const buf = fs.readFileSync(file);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), path.basename(file));
  fd.append("settings", JSON.stringify(settings));
  const res = await fetch(`${BASE}${apiToolPath(toolId)}`, { method: "POST", body: fd });
  if (res.status === 200) {
    const j = (await res.json()) as { downloadUrl?: string };
    if (j.downloadUrl) {
      const dl = await fetch(`${BASE}${j.downloadUrl}`);
      return { mode: "sync", out: Buffer.from(await dl.arrayBuffer()) };
    }
    return { mode: "sync", j };
  }
  if (res.status === 202) {
    const j = (await res.json()) as { jobId: string };
    const done = await pollSSE(j.jobId);
    if (done.failed || done.timeout) return { mode: "async", failed: done };
    const dlUrl =
      (done.downloadUrl as string | undefined) ??
      (done.result as { downloadUrl?: string } | undefined)?.downloadUrl;
    if (dlUrl) {
      const dl = await fetch(`${BASE}${dlUrl}`);
      if (dl.ok) return { mode: "async", out: Buffer.from(await dl.arrayBuffer()), done };
    }
    const out = await fetchOutput(j.jobId);
    return { mode: "async", out, done };
  }
  return { status: res.status, body: (await res.text()).slice(0, 200) };
}

const IMG = "tests/fixtures/image/valid";
const AUD = "tests/fixtures/audio/valid";
const DOC = "tests/fixtures/document/valid";

const t = await run("transcribe-audio", `${AUD}/speech-10s.wav`, { outputFormat: "txt" });
console.log(
  "TRANSCRIBE:",
  t.out ? `text="${t.out.toString("utf8").slice(0, 200)}"` : JSON.stringify(t).slice(0, 300),
);

const o = await run("ocr", `${IMG}/ocr-clean.png`, {});
console.log(
  "OCR:",
  o.out ? `text="${o.out.toString("utf8").slice(0, 200)}"` : JSON.stringify(o).slice(0, 300),
);

const r = await run("remove-background", `${IMG}/portrait-color.jpg`, { outputFormat: "png" });
if (r.out) {
  fs.writeFileSync("/tmp/rembg-out.png", r.out);
  let probe = "";
  try {
    probe = execFileSync(
      "ffprobe",
      ["-v", "quiet", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", "/tmp/rembg-out.png"],
      { encoding: "utf8" },
    ).replace(/\s+/g, " ");
  } catch (e) {
    probe = `ffprobe-failed: ${String(e).slice(0, 80)}`;
  }
  console.log(`REMOVE-BG: png bytes=${r.out.length} ${probe}`);
} else {
  console.log("REMOVE-BG:", JSON.stringify(r).slice(0, 300));
}

// F9: ocr-pdf must not segfault and should return text
const op = await run("ocr-pdf", `${DOC}/ocr-scanned.pdf`, {});
console.log(
  "OCR-PDF:",
  op.out ? `out="${op.out.toString("utf8").slice(0, 160)}"` : JSON.stringify(op).slice(0, 300),
);

// F11: RAW processing must work (resize a .cr2 from the formats fixtures)
const raw = await run("resize", "tests/fixtures/image/formats/sample.cr2", { width: 80 });
console.log(
  "RAW-RESIZE(cr2):",
  raw.out ? `bytes=${raw.out.length}` : JSON.stringify(raw).slice(0, 300),
);

console.log("DONE");
