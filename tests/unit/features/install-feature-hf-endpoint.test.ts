// Issue #4843: the bundle installer's sequential fallback built its URL from a
// hardcoded huggingface.co, so an admin who set HF_ENDPOINT to a mirror got the
// mirror only on the accelerated path and fell back to the blocked host the
// moment that path failed. The manual-download hint pointed there too.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const INSTALLER = join(process.cwd(), "packages", "ai", "python", "install_feature.py");

// Force the fallback (accelerated client unavailable), record the URL the
// sequential downloader is handed, and fail it so the manual hint surfaces.
const SCRIPT = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("inst", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
urls = []
errors = []
def fake_resume(url, *args, **kwargs):
    urls.append(url)
    raise RuntimeError("connection blocked")
def fake_fail(message):
    errors.append(message)
    raise SystemExit(1)
mod.download_with_hf_hub = lambda *args, **kwargs: False
mod.download_with_resume = fake_resume
mod.fail = fake_fail
try:
    mod.download_and_verify("org/bundles", "v2.0.0/ocr-amd64.tar.gz", sys.argv[2], "0" * 64, 10)
except SystemExit:
    pass
print(json.dumps({"urls": urls, "error": errors[-1] if errors else None}))
`;

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function runFallback(hfEndpoint: string | undefined): { urls: string[]; error: string | null } {
  const directory = mkdtempSync(join(tmpdir(), "snapotter-hf-endpoint-"));
  directories.push(directory);
  const env = { ...process.env };
  delete env.HF_ENDPOINT;
  if (hfEndpoint !== undefined) env.HF_ENDPOINT = hfEndpoint;
  const res = spawnSync(
    pythonBin as string,
    ["-c", SCRIPT, INSTALLER, join(directory, "ocr-amd64.tar.gz")],
    { encoding: "utf8", env, timeout: 20000 },
  );
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim());
}

describe.skipIf(!hasPython)("install_feature.py download source (#4843)", () => {
  it("falls back to huggingface.co when HF_ENDPOINT is unset", () => {
    const result = runFallback(undefined);
    const url = "https://huggingface.co/org/bundles/resolve/main/v2.0.0/ocr-amd64.tar.gz";
    expect(result.urls).toEqual([url]);
    expect(result.error).toContain(url);
  });

  it("sends the sequential fallback and the manual hint to the HF_ENDPOINT mirror", () => {
    const result = runFallback("https://hf-mirror.example/");
    const url = "https://hf-mirror.example/org/bundles/resolve/main/v2.0.0/ocr-amd64.tar.gz";
    expect(result.urls).toEqual([url]);
    expect(result.error).toContain(url);
    expect(result.error).not.toContain("huggingface.co");
  });

  it("keeps mirror credentials out of the manual hint", () => {
    const result = runFallback("https://user:secret@hf-mirror.example");
    expect(result.urls).toEqual([
      "https://user:secret@hf-mirror.example/org/bundles/resolve/main/v2.0.0/ocr-amd64.tar.gz",
    ]);
    expect(result.error).toContain(
      "https://hf-mirror.example/org/bundles/resolve/main/v2.0.0/ocr-amd64.tar.gz",
    );
    expect(result.error).not.toContain("secret");
  });

  it("treats a blank HF_ENDPOINT as unset", () => {
    const result = runFallback("  ");
    expect(result.urls).toEqual([
      "https://huggingface.co/org/bundles/resolve/main/v2.0.0/ocr-amd64.tar.gz",
    ]);
  });
});
