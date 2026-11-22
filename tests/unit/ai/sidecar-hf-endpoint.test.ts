// Issue #4952: with SNAPOTTER_ALLOW_MODEL_DOWNLOAD on, the LaMa and NAFNet
// runtime fallbacks fetched from a hardcoded huggingface.co, so an admin who
// set HF_ENDPOINT to a mirror still hit the blocked host. The bridge also never
// handed HF_ENDPOINT to the sidecar, so the mirror couldn't reach the scripts.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMinimalEnv } from "../../../packages/ai/src/bridge.js";
import { hasPython, pythonBin } from "../../helpers/python-gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(here, "../../../packages/ai/python");

// Load each sidecar with no bundled weights, stub urlretrieve to record the
// URL, and drive the real resolver down its download branch. All four modules
// import only the stdlib at the top level, so this runs wherever python3 does.
const SCRIPT = `
import importlib.util, json, os, sys, urllib.request
py_dir = sys.argv[1]
sys.path.insert(0, py_dir)
urls = []
def fake_retrieve(url, dest):
    # No file is written: all three LaMa resolvers share one cache path.
    urls.append(url)
    return dest, None
urllib.request.urlretrieve = fake_retrieve

def load(name):
    spec = importlib.util.spec_from_file_location(name + "_mod", os.path.join(py_dir, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def fetched(fn):
    urls.clear()
    fn()
    return urls[-1]

inpaint = load("inpaint")
outpaint = load("outpaint")
restore = load("restore")
noise = load("noise_removal")
from offline_guard import hf_url
missing = os.path.join(os.environ["MODELS_PATH"], "missing.pth")
if "@" in os.environ.get("HF_ENDPOINT", ""):
    try:
        inpaint._get_model_path()
    except RuntimeError as err:
        print(json.dumps({"error": str(err), "urls": urls}))
    sys.exit(0)
print(json.dumps({
    "inpaint": fetched(inpaint._get_model_path),
    "outpaint": fetched(outpaint._get_model_path),
    "restore": fetched(restore._get_lama_path),
    "nafnet": fetched(lambda: noise._get_model_path(
        missing, "NAFNet-SIDD-width64.pth", hf_url(noise.NAFNET_HF_PATH))),
}))
`;

const LAMA = "Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";
const NAFNET = "mikestealth/nafnet-models/resolve/main/NAFNet-SIDD-width64.pth";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function fallbackUrls(hfEndpoint: string | undefined): Record<string, unknown> {
  const directory = mkdtempSync(join(tmpdir(), "snapotter-sidecar-hf-"));
  directories.push(directory);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: directory,
    USERPROFILE: directory,
    MODELS_PATH: join(directory, "models"),
    SNAPOTTER_ALLOW_MODEL_DOWNLOAD: "1",
  };
  delete env.HF_ENDPOINT;
  delete env.LAMA_MODEL_DIR;
  if (hfEndpoint !== undefined) env.HF_ENDPOINT = hfEndpoint;
  const res = spawnSync(pythonBin as string, ["-c", SCRIPT, pyDir], {
    encoding: "utf8",
    env,
    timeout: 20000,
  });
  if (res.status !== 0) throw new Error(`python3 failed: ${res.stderr}`);
  return JSON.parse(res.stdout.trim());
}

describe.skipIf(!hasPython)("sidecar runtime model downloads (#4952)", () => {
  it("fetch from huggingface.co when HF_ENDPOINT is unset", () => {
    expect(fallbackUrls(undefined)).toEqual({
      inpaint: `https://huggingface.co/${LAMA}`,
      outpaint: `https://huggingface.co/${LAMA}`,
      restore: `https://huggingface.co/${LAMA}`,
      nafnet: `https://huggingface.co/${NAFNET}`,
    });
  });

  it("fetch from the HF_ENDPOINT mirror", () => {
    expect(fallbackUrls("https://hf-mirror.example/")).toEqual({
      inpaint: `https://hf-mirror.example/${LAMA}`,
      outpaint: `https://hf-mirror.example/${LAMA}`,
      restore: `https://hf-mirror.example/${LAMA}`,
      nafnet: `https://hf-mirror.example/${NAFNET}`,
    });
  });

  it("refuse a mirror URL with credentials without echoing it", () => {
    const result = fallbackUrls("https://user:s3cret@hf-mirror.example");
    expect(result.urls).toEqual([]);
    expect(result.error).toContain("HF_ENDPOINT must not contain credentials");
    expect(result.error).not.toContain("s3cret");
  });

  it("treat a blank HF_ENDPOINT as unset", () => {
    expect(fallbackUrls("  ").inpaint).toBe(`https://huggingface.co/${LAMA}`);
  });
});

describe("sidecar scripts", () => {
  it.each(["inpaint.py", "outpaint.py", "restore.py", "noise_removal.py"])(
    "%s builds Hugging Face URLs from HF_ENDPOINT, not a hardcoded host",
    (file) => {
      expect(readFileSync(join(pyDir, file), "utf8")).not.toContain("https://huggingface.co");
    },
  );
});

describe("sidecar HF_ENDPOINT forwarding (#4952)", () => {
  it("forwards HF_ENDPOINT when runtime downloads are enabled", () => {
    vi.stubEnv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "1");
    vi.stubEnv("HF_ENDPOINT", "https://hf-mirror.example");
    expect(buildMinimalEnv().HF_ENDPOINT).toBe("https://hf-mirror.example");
  });

  it("withholds HF_ENDPOINT when runtime downloads are disabled", () => {
    vi.stubEnv("SNAPOTTER_ALLOW_MODEL_DOWNLOAD", "0");
    vi.stubEnv("HF_ENDPOINT", "https://hf-mirror.example");
    expect(buildMinimalEnv()).not.toHaveProperty("HF_ENDPOINT");
  });
});
