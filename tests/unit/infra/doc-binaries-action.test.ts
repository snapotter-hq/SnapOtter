import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  name?: string;
  uses?: string;
  shell?: string;
  run?: string;
}

interface CompositeAction {
  description?: string;
  runs: {
    using: string;
    steps: Step[];
  };
}

interface Workflow {
  jobs: Record<
    string,
    {
      steps?: Step[];
    }
  >;
}

function readYaml<T>(relPath: string): T {
  return load(readFileSync(path.join(root, relPath), "utf8")) as T;
}

const tempDirs: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function runBash(
  script: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-euo", "pipefail", "-c", script], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

describe("doc-binaries composite action (#2763)", () => {
  it("shares .github/actions/doc-binaries across ci.yml and nightly.yml without inline duplication", () => {
    const ci = readYaml<Workflow>(".github/workflows/ci.yml");
    const nightly = readYaml<Workflow>(".github/workflows/nightly.yml");

    for (const [workflowName, jobName, job] of [
      ["ci.yml", "test-integration", ci.jobs["test-integration"]],
      ["nightly.yml", "extended-matrix", nightly.jobs["extended-matrix"]],
      ["nightly.yml", "coverage-report", nightly.jobs["coverage-report"]],
    ] as const) {
      const steps = job?.steps ?? [];
      expect(
        steps.some((step) => step.uses === "./.github/actions/doc-binaries"),
        `${workflowName} (${jobName}) should use ./.github/actions/doc-binaries`,
      ).toBe(true);
      const inlineRuns = steps.map((step) => step.run ?? "").join("\n");
      expect(inlineRuns).not.toContain("jgm/pandoc/releases/download");
      expect(inlineRuns).not.toContain("pdfcpu/pdfcpu/releases/download");
    }
  });

  it("pins versions and SHA-256 checksums matching docker/Dockerfile and go.mod, with curl retry flags", () => {
    const dockerfile = readFileSync(path.join(root, "docker/Dockerfile"), "utf8");
    const pdfcpuGoMod = readFileSync(path.join(root, "docker/go-tools/pdfcpu/go.mod"), "utf8");
    const action = readYaml<CompositeAction>(".github/actions/doc-binaries/action.yml");

    const pandocVersion = dockerfile.match(/^ARG PANDOC_VERSION=(\S+)$/m)?.[1];
    const pandocAmd64Sha = dockerfile.match(
      /amd64\)\s+PANDOC_ARCH=amd64;\s+PANDOC_SHA256=([a-f0-9]{64})/,
    )?.[1];
    const pdfcpuVersion = pdfcpuGoMod.match(/github\.com\/pdfcpu\/pdfcpu\s+(v\S+)/)?.[1];

    expect(pandocVersion).toBeTruthy();
    expect(pandocAmd64Sha).toBeTruthy();
    expect(pdfcpuVersion).toBeTruthy();

    expect(action.runs.steps).toHaveLength(2);
    const [pandocStep, pdfcpuStep] = action.runs.steps;

    expect(pandocStep.run).toContain(
      `https://github.com/jgm/pandoc/releases/download/${pandocVersion}/pandoc-${pandocVersion}-1-amd64.deb`,
    );
    expect(pandocStep.run).toContain(pandocAmd64Sha);
    expect(pandocStep.run).toContain("sha256sum --check --strict -");

    const pdfcpuVerNoV = pdfcpuVersion?.replace(/^v/, "");
    expect(pdfcpuStep.run).toContain(
      `https://github.com/pdfcpu/pdfcpu/releases/download/${pdfcpuVersion}/pdfcpu_${pdfcpuVerNoV}_Linux_x86_64.tar.xz`,
    );
    expect(pdfcpuStep.run).toContain(
      "0f03f691c6275fa826e5d99e7aefbc8050180e4bc4a3b919b582137cd7da9bd7",
    );
    expect(pdfcpuStep.run).toContain("sha256sum --check --strict -");

    for (const step of action.runs.steps) {
      expect(step.shell).toBe("bash");
      const curlLines = (step.run ?? "")
        .replace(/\\\n\s*/g, " ")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("curl "));
      expect(curlLines.length).toBeGreaterThan(0);
      for (const curlLine of curlLines) {
        expect(curlLine).toMatch(/(?:-[a-zA-Z]*f|--fail\b)/);
        expect(curlLine).toMatch(/(?:-[a-zA-Z]*L|--location\b)/);
        expect(curlLine).toContain("--retry 5");
        expect(curlLine).toContain("--retry-delay 2");
        expect(curlLine).toContain("--retry-all-errors");
      }
    }
  });

  it("retries transient HTTP 502 errors on download and rejects checksum mismatches before install", async () => {
    const action = readYaml<CompositeAction>(".github/actions/doc-binaries/action.yml");
    const [pandocStep, pdfcpuStep] = action.runs.steps;
    expect(pandocStep?.run).toBeTruthy();
    expect(pdfcpuStep?.run).toBeTruthy();

    const dir = mkdtempSync(path.join(tmpdir(), "doc-binaries-test-"));
    tempDirs.push(dir);
    const binDir = path.join(dir, "bin");
    const tmpPath = path.join(dir, "tmp");
    const pandocInstalledFlag = path.join(dir, "pandoc-installed");
    const pdfcpuInstalledFlag = path.join(dir, "pdfcpu-installed");
    mkdirSync(binDir, { recursive: true });
    mkdirSync(tmpPath, { recursive: true });

    const pandocPayload = Buffer.from("fake-pandoc-deb-payload");
    const pandocSha = createHash("sha256").update(pandocPayload).digest("hex");
    const pdfcpuPayload = Buffer.from("fake-pdfcpu-tar-xz-payload");
    const pdfcpuSha = createHash("sha256").update(pdfcpuPayload).digest("hex");

    const writeStub = (name: string, body: string) => {
      const target = path.join(binDir, name);
      writeFileSync(target, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
      chmodSync(target, 0o755);
    };

    writeStub("sudo", 'exec "$@"');
    writeStub(
      "apt-get",
      `for arg in "$@"; do
  if [[ "$arg" == *.deb ]]; then
    [ -f "$arg" ] || exit 1
    touch "${pandocInstalledFlag}"
  fi
done`,
    );
    writeStub("pandoc", 'echo "pandoc 3.10"');
    writeStub(
      "tar",
      `archive=""
dest=""
while [ $# -gt 0 ]; do
  case "$1" in
    -xJf) archive="$2"; shift 2 ;;
    -C) dest="$2"; shift 2 ;;
    *) shift ;;
  esac
done
[ -f "$archive" ] || exit 1
mkdir -p "$dest/pdfcpu_0.13.0_Linux_x86_64"
printf '#!/usr/bin/env bash\\necho "pdfcpu v0.13.0"\\n' > "$dest/pdfcpu_0.13.0_Linux_x86_64/pdfcpu"
chmod +x "$dest/pdfcpu_0.13.0_Linux_x86_64/pdfcpu"`,
    );
    writeStub(
      "install",
      `[ -f "$1" ] || exit 1
touch "${pdfcpuInstalledFlag}"`,
    );
    writeStub("pdfcpu", 'echo "pdfcpu v0.13.0"');
    writeStub(
      "sha256sum",
      `"${process.execPath}" -e '
const fs = require("node:fs");
const crypto = require("node:crypto");
const input = fs.readFileSync(0, "utf8").trim();
const match = input.match(/^([a-f0-9]{64})  (.+)$/);
if (!match) process.exit(2);
const [, expected, file] = match;
const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (actual !== expected) {
  console.error(file + ": FAILED");
  process.exit(1);
}
console.log(file + ": OK");
'`,
    );

    let attempts = 0;
    let serveCorrupt = false;
    const server = createServer((req, res) => {
      attempts += 1;
      if (attempts <= 2) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("502 Bad Gateway");
        return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      if (serveCorrupt) {
        res.end(Buffer.from("corrupted-bytes"));
        return;
      }
      res.end(req.url?.includes("pdfcpu") ? pdfcpuPayload : pandocPayload);
    });
    servers.push(server);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }

    const rewriteScript = (raw: string) =>
      raw
        .replaceAll("https://github.com", `http://127.0.0.1:${address.port}`)
        .replaceAll("--retry-delay 2", "--retry-delay 1")
        .replaceAll("d502599878eb29af3ae5f0cb5d559134df96534125d452c7a0674a5bad2c5ecf", pandocSha)
        .replaceAll("0f03f691c6275fa826e5d99e7aefbc8050180e4bc4a3b919b582137cd7da9bd7", pdfcpuSha)
        .replaceAll("/tmp/", `${tmpPath}/`);

    const env = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
    };

    for (const [step, flag, cleanedPaths] of [
      [pandocStep, pandocInstalledFlag, [path.join(tmpPath, "pandoc.deb")]],
      [
        pdfcpuStep,
        pdfcpuInstalledFlag,
        [path.join(tmpPath, "pdfcpu.tar.xz"), path.join(tmpPath, "pdfcpu-extract")],
      ],
    ] as const) {
      attempts = 0;
      serveCorrupt = false;
      rmSync(flag, { force: true });

      const okResult = await runBash(rewriteScript(step.run ?? ""), env);
      expect(okResult.code, okResult.stderr).toBe(0);
      expect(attempts).toBe(3);
      expect(existsSync(flag)).toBe(true);
      for (const cleaned of cleanedPaths) {
        expect(existsSync(cleaned)).toBe(false);
      }

      rmSync(flag, { force: true });
      attempts = 2;
      serveCorrupt = true;

      const badResult = await runBash(rewriteScript(step.run ?? ""), env);
      expect(badResult.code).not.toBe(0);
      expect(existsSync(flag)).toBe(false);
    }
  });
});
