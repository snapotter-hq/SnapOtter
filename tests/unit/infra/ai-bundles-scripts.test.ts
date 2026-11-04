import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, type KeyObject } from "node:crypto";
import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_BUNDLES_SCRIPT_HEADER,
  AI_BUNDLES_WORKFLOW,
  aiBundlesScriptBody,
} from "../../helpers/ai-bundles-workflow.js";

const root = path.resolve(import.meta.dirname, "../../..");
const SCRIPTS_DIR = "scripts/ai-bundles";
const INLINE_RUN_LINE_LIMIT = 30;
const DOLLAR = "$";

interface Step {
  name?: string;
  uses?: string;
  run?: string;
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

function runLineCount(run: string): number {
  return run.replace(/\n+$/, "").split("\n").length;
}

describe("ai-bundles.yml step scripts (#4452)", () => {
  const workflow = load(readFileSync(path.join(root, AI_BUNDLES_WORKFLOW), "utf8")) as Workflow;
  const scriptedSteps = Object.entries(workflow.jobs).flatMap(([jobName, job]) =>
    (job.steps ?? []).flatMap((step, index) =>
      step.run?.startsWith(`${SCRIPTS_DIR}/`) ? [{ jobName, index, step, script: step.run }] : [],
    ),
  );

  it("keeps every inline run block under the size limit once the job has a checkout", () => {
    // A script only exists on the runner after actions/checkout, so a long
    // step that runs before the job's first checkout (or in a job with none)
    // has to stay inline.
    const oversized: string[] = [];
    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      let checkedOut = false;
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) checkedOut = true;
        if (!step.run || step.run.startsWith(`${SCRIPTS_DIR}/`)) continue;
        if (checkedOut && runLineCount(step.run) >= INLINE_RUN_LINE_LIMIT) {
          oversized.push(`${jobName} :: ${step.name} (${runLineCount(step.run)} lines)`);
        }
      }
    }
    expect(oversized).toEqual([]);
  });

  it("references only scripts that exist, run under bash -e, and follow a checkout", () => {
    expect(scriptedSteps.length).toBeGreaterThan(0);
    for (const { jobName, index, step, script } of scriptedSteps) {
      expect(script, `${step.name} must call one script with no arguments`).toMatch(
        /^scripts\/ai-bundles\/[a-z0-9-]+\.sh$/,
      );
      const absolute = path.join(root, script);
      expect(existsSync(absolute), `${script} is missing`).toBe(true);
      expect(statSync(absolute).mode & 0o111, `${script} is not executable`).not.toBe(0);
      expect(readFileSync(absolute, "utf8").startsWith(AI_BUNDLES_SCRIPT_HEADER)).toBe(true);
      // GitHub never expands expressions inside a script file, so every value
      // a script needs has to arrive through the step's env block.
      expect(aiBundlesScriptBody(root, script)).not.toContain(`${DOLLAR}{{`);

      const earlier = workflow.jobs[jobName].steps?.slice(0, index) ?? [];
      expect(
        earlier.some((candidate) => candidate.uses?.startsWith("actions/checkout@")),
        `${jobName} :: ${step.name} runs before any checkout`,
      ).toBe(true);
    }
  });

  it("leaves no unreferenced script behind", () => {
    const referenced = new Set(scriptedSteps.map(({ script }) => path.basename(script)));
    expect(referenced.size).toBe(scriptedSteps.length);
    expect(new Set(readdirSync(path.join(root, SCRIPTS_DIR)))).toEqual(referenced);
  });
});

/**
 * The behaviour tests run the real scripts with every absolute /tmp/ path
 * rebased into a scratch directory, the Hugging Face client replaced by a
 * recording stub, and git replaced by a stub that reports chosen commits.
 * They need GitHub's Ubuntu toolchain (GNU base64, OpenSSL 3 with raw
 * Ed25519, python3). Off CI a host without it skips; in CI it fails.
 */
const toolchainReady =
  spawnSync(
    "bash",
    [
      "-c",
      "command -v python3 && printf x | base64 --wrap=0 && openssl genpkey -algorithm ed25519 && openssl pkeyutl -help 2>&1 | grep -q rawin",
    ],
    { stdio: "ignore" },
  ).status === 0;
const inCI = process.env.CI === "true";
const describeWithToolchain = toolchainReady || inCI ? describe : describe.skip;

const VERSION = "9.8.7";
const RELEASE_COMMIT = "a".repeat(40);
const WORKFLOW_COMMIT = "b".repeat(40);
const HF_SNAPSHOT = "c".repeat(40);
const HF_PUBLISHED = "d".repeat(40);
const KEY_ID = "snapotter-ocr-test";
const TARGETS = {
  "linux-amd64-cpu-py312": { arch: "amd64", imagePlatform: "linux-amd64" },
  "linux-arm64-cpu-py311": { arch: "arm64", imagePlatform: "linux-arm64" },
} as const;
type Target = keyof typeof TARGETS;
const TARGET_NAMES = Object.keys(TARGETS) as Target[];
const ATTESTATIONS = [
  ...TARGET_NAMES.flatMap((target) => [
    `ocr-${target}-sbom.cdx.json`,
    `ocr-${target}-sbom.spdx.json`,
    `ocr-${target}-trivy.json`,
    `ocr-${target}-native-cpu.quality.json`,
  ]),
  "ocr-linux-amd64-cpu-py312-nvidia-exposed-cpu.quality.json",
];

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Python's json.dumps(sort_keys=True, separators=(",", ":")) for ASCII input. */
function canonical(value: unknown): string {
  return `${JSON.stringify(sortKeys(value))}\n`;
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const HF_STUB = `import json
import os
from pathlib import Path

_STATE = Path(os.environ["HF_STUB_STATE"])


def _load():
    return json.loads(_STATE.read_text())


def _save(state):
    _STATE.write_text(json.dumps(state))


def _log(call, **fields):
    with Path(os.environ["HF_STUB_LOG"]).open("a") as handle:
        handle.write(json.dumps({"call": call, **fields}) + "\\n")


class _RepoInfo:
    def __init__(self, sha):
        self.sha = sha


class _CommitInfo:
    def __init__(self, oid):
        self.oid = oid


class HfApi:
    def __init__(self, token=None):
        self.token = token

    def repo_info(self, repo_id, repo_type=None, revision=None, token=None):
        state = _load()
        shas = state["mainShas"]
        sha = shas.pop(0) if len(shas) > 1 else shas[0]
        _save(state)
        _log("repo_info", repo_id=repo_id, revision=revision, sha=sha)
        return _RepoInfo(sha)

    def file_exists(self, repo_id, filename, repo_type=None, revision=None, token=None):
        _log("file_exists", repo_id=repo_id, filename=filename, revision=revision)
        return filename in _load()["files"]

    def list_repo_files(self, repo_id, repo_type=None, revision=None, token=None):
        _log("list_repo_files", repo_id=repo_id, revision=revision)
        return sorted(_load()["files"])

    def upload_folder(self, **kwargs):
        state = _load()
        folder = Path(kwargs["folder_path"])
        _log(
            "upload_folder",
            repo_id=kwargs["repo_id"],
            path_in_repo=kwargs["path_in_repo"],
            revision=kwargs["revision"],
            parent_commit=kwargs["parent_commit"],
        )
        for file in folder.rglob("*"):
            if file.is_file():
                remote = f"{kwargs['path_in_repo']}/{file.relative_to(folder).as_posix()}"
                state["files"][remote] = str(file)
        state["mainShas"] = state["mainShasAfterUpload"]
        _save(state)
        return _CommitInfo(state["uploadOid"])


def hf_hub_download(repo_id, filename, repo_type=None, revision=None, token=None):
    _log("hf_hub_download", repo_id=repo_id, filename=filename, revision=revision)
    return _load()["files"][filename]
`;

const GIT_STUB = `#!/bin/sh
printf '%s\\n' "$*" >> "$GIT_STUB_LOG"
case "$1" in
  fetch) exit 0 ;;
  rev-parse)
    if [ "$2" = HEAD ]; then echo "$GIT_STUB_HEAD"; else echo "$GIT_STUB_TAG"; fi ;;
  *) exit 1 ;;
esac
`;

interface HfState {
  mainShas: string[];
  files: Record<string, string>;
  uploadOid: string;
  mainShasAfterUpload: string[];
}

interface HfCall {
  call: string;
  [field: string]: unknown;
}

class Sandbox {
  readonly tmp = mkdtempSync(path.join(tmpdir(), "ai-bundles-scripts-"));
  readonly work = path.join(this.tmp, "work");
  readonly githubEnv = path.join(this.tmp, "github-env");
  readonly upload = path.join(this.tmp, "upload", `v${VERSION}`);
  private readonly stubBin = path.join(this.tmp, "stub-bin");
  private readonly stubPython = path.join(this.tmp, "stub-python");
  private readonly scripts = path.join(this.tmp, "scripts");
  private readonly hfState = path.join(this.tmp, "hf-state.json");
  private readonly hfLog = path.join(this.tmp, "hf-log.jsonl");
  private readonly gitLog = path.join(this.tmp, "git-log");
  readonly signingKey: KeyObject;
  readonly publicKeyPem: string;

  constructor() {
    for (const dir of [this.work, this.stubBin, this.scripts, this.tmp]) {
      mkdirSync(dir, { recursive: true });
    }
    mkdirSync(path.join(this.stubPython, "huggingface_hub"), { recursive: true });
    writeFileSync(path.join(this.stubPython, "huggingface_hub", "__init__.py"), HF_STUB);
    writeFileSync(path.join(this.stubBin, "git"), GIT_STUB, { mode: 0o755 });
    // The publish steps call the hash-locked venv's interpreter by absolute
    // path; the rebased path lands here and runs python3 against the stub.
    const venvBin = path.join(this.tmp, "hf-release-venv", "bin");
    mkdirSync(venvBin, { recursive: true });
    writeFileSync(path.join(venvBin, "python"), '#!/bin/sh\nexec python3 "$@"\n', { mode: 0o755 });
    writeFileSync(this.githubEnv, "");
    writeFileSync(this.hfLog, "");
    writeFileSync(this.gitLog, "");
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    this.signingKey = privateKey;
    this.publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    this.setHf({ mainShas: [HF_SNAPSHOT], files: {} });
  }

  cleanup(): void {
    rmSync(this.tmp, { recursive: true, force: true });
  }

  path(...parts: string[]): string {
    return path.join(this.tmp, ...parts);
  }

  setHf(state: Partial<HfState>): void {
    const current: HfState = existsSync(this.hfState)
      ? JSON.parse(readFileSync(this.hfState, "utf8"))
      : { mainShas: [], files: {}, uploadOid: HF_PUBLISHED, mainShasAfterUpload: [HF_PUBLISHED] };
    writeFileSync(this.hfState, JSON.stringify({ ...current, ...state }));
  }

  hfCalls(call?: string): HfCall[] {
    return readFileSync(this.hfLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HfCall)
      .filter((entry) => !call || entry.call === call);
  }

  gitCalls(): string[] {
    return readFileSync(this.gitLog, "utf8").split("\n").filter(Boolean);
  }

  githubEnvLines(): string[] {
    return readFileSync(this.githubEnv, "utf8").split("\n").filter(Boolean);
  }

  baseEnv(): Record<string, string> {
    return {
      PATH: `${this.stubBin}:${process.env.PATH ?? ""}`,
      // Keep the real HOME: python3 can be a shim that resolves its venv from it.
      HOME: process.env.HOME ?? this.tmp,
      PYTHONPATH: this.stubPython,
      PYTHONDONTWRITEBYTECODE: "1",
      GITHUB_ENV: this.githubEnv,
      HF_STUB_STATE: this.hfState,
      HF_STUB_LOG: this.hfLog,
      GIT_STUB_LOG: this.gitLog,
      GIT_STUB_HEAD: RELEASE_COMMIT,
      GIT_STUB_TAG: RELEASE_COMMIT,
      VERSION,
      OCR_RUNTIME_INDEX_KEY_ID: KEY_ID,
      OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64: Buffer.from(this.publicKeyPem).toString("base64"),
    };
  }

  /** Runs the committed script with its /tmp/ paths rebased into the sandbox. */
  run(script: string, env: Record<string, string> = {}) {
    const source = readFileSync(path.join(root, SCRIPTS_DIR, script), "utf8");
    expect(source, `${script} no longer uses /tmp/; update the sandbox`).toContain("/tmp/");
    const rebased = path.join(this.scripts, script);
    writeFileSync(rebased, source.replaceAll("/tmp/", `${this.tmp}/`), { mode: 0o755 });
    const result = spawnSync("bash", [rebased], {
      cwd: this.work,
      env: { ...this.baseEnv(), ...env },
      encoding: "utf8",
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  }
}

/** Writes the build-ocr, verify-ocr, and image-digest outputs sign-ocr-index downloads. */
function writeVerifiedBuildOutputs(box: Sandbox): void {
  const manifestTargets: Record<string, unknown> = {};
  for (const target of TARGET_NAMES) {
    const { arch, imagePlatform } = TARGETS[target];
    const imageDigest = sha256(`image ${target}`);
    mkdirSync(box.path("image-digests", imagePlatform), { recursive: true });
    writeFileSync(box.path("image-digests", imagePlatform, imageDigest), "");

    const runtimeFile = (relative: string) => {
      const body = `${target} ${relative}`;
      return { path: relative, sha256: sha256(body), size: body.length };
    };
    const model = runtimeFile("models/det.onnx");
    const legal = {
      "snapotter-agpl": runtimeFile("LICENSE"),
      "apache-2.0": runtimeFile("licenses/apache-2.0.txt"),
      "antlr-4.9.3-license": runtimeFile("licenses/antlr.txt"),
    };
    const notices = runtimeFile("THIRD_PARTY_NOTICES.json");
    const archiveName = `ocr-${target}.tar.gz`;
    const archiveBytes = Buffer.from(`archive bytes for ${target}`);
    const archive = {
      expandedSize: 4096,
      file: archiveName,
      sha256: sha256(archiveBytes),
      size: archiveBytes.length,
    };
    const artifact = {
      arch,
      archive,
      capabilities: { providers: ["CPUExecutionProvider"] },
      family: "ocr",
      files: [model, ...Object.values(legal), notices],
      legalMaterials: Object.entries(legal).map(([id, record]) => ({ id, ...record })),
      modelObjects: [{ id: "det", license: "Apache-2.0", source: "local build", ...model }],
      models: { det: model.sha256 },
      platform: "linux",
      provenance: {
        builderId: `github-actions:.github/workflows/ai-bundles.yml@${WORKFLOW_COMMIT}`,
        sourceCommit: RELEASE_COMMIT,
        sourceImageDigest: `sha256:${imageDigest}`,
      },
      resources: { minimumMemoryBytes: 4 * 1024 * 1024 * 1024 },
      target,
      version: VERSION,
    };
    mkdirSync(box.path("ocr-artifacts"), { recursive: true });
    writeFileSync(box.path("ocr-artifacts", archiveName), archiveBytes);
    writeFileSync(box.path("ocr-artifacts", `${archiveName}.sha256`), `${archive.sha256}\n`);
    writeFileSync(box.path("ocr-artifacts", `ocr-${target}.artifact.json`), canonical(artifact));
    manifestTargets[target] = {
      compressedSizeEstimate: archive.size,
      extractedSizeEstimate: archive.expandedSize,
      sizeKind: "measured-estimate",
    };
  }
  mkdirSync(box.path("ocr-attestations"), { recursive: true });
  for (const name of ATTESTATIONS) {
    writeFileSync(box.path("ocr-attestations", name), `{"report":"${name}"}\n`);
  }
  mkdirSync(path.join(box.work, "docker"), { recursive: true });
  writeFileSync(
    path.join(box.work, "docker", "feature-manifest.json"),
    JSON.stringify({ bundles: { ocr: { targets: manifestTargets } } }),
  );
}

const indexEnv = {
  SNAPOTTER_RELEASE_COMMIT: RELEASE_COMMIT,
  SNAPOTTER_WORKFLOW_COMMIT: WORKFLOW_COMMIT,
};

function signingEnv(box: Sandbox): Record<string, string> {
  const privatePem = box.signingKey.export({ format: "pem", type: "pkcs8" }).toString();
  return { OCR_RUNTIME_INDEX_SIGNING_KEY_B64: Buffer.from(privatePem).toString("base64") };
}

/** Runs the whole sign-ocr-index job and stages its outputs where publish downloads them. */
function signAndStageRelease(box: Sandbox): void {
  writeVerifiedBuildOutputs(box);
  for (const [script, env] of [
    ["create-unsigned-ocr-index.sh", indexEnv],
    ["sign-ocr-index.sh", signingEnv(box)],
    ["seal-ocr-index.sh", {}],
  ] as const) {
    const result = box.run(script, env);
    expect(result.status, `${script}: ${result.output}`).toBe(0);
  }
  for (const target of TARGET_NAMES) {
    const dir = box.path("artifacts", `ocr-${target}`);
    mkdirSync(dir, { recursive: true });
    for (const name of [
      `ocr-${target}.tar.gz`,
      `ocr-${target}.tar.gz.sha256`,
      `ocr-${target}.artifact.json`,
    ]) {
      cpSync(box.path("ocr-artifacts", name), path.join(dir, name));
    }
  }
  mkdirSync(box.path("artifacts", "ocr-attestations"), { recursive: true });
  for (const name of ATTESTATIONS) {
    cpSync(box.path("ocr-attestations", name), box.path("artifacts", "ocr-attestations", name));
  }
  mkdirSync(box.path("artifacts", "ocr-runtime-metadata"), { recursive: true });
  for (const name of ["ocr-runtime-index.json", "ocr-runtime-trusted-keys.json"]) {
    cpSync(box.path("ocr-index", name), box.path("artifacts", "ocr-runtime-metadata", name));
  }
}

/** Organizes the staged release into /tmp/upload, the state the HF steps start from. */
function organizeRelease(box: Sandbox): void {
  signAndStageRelease(box);
  const result = box.run("organize-ocr-release-closure.sh");
  expect(result.status, result.output).toBe(0);
}

/** Copies the candidate release into a fake Hugging Face snapshot. */
function publishCandidateRemotely(box: Sandbox): Record<string, string> {
  const remoteRoot = box.path("hf-remote", `v${VERSION}`);
  cpSync(box.upload, remoteRoot, { recursive: true });
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files[`v${VERSION}/${path.relative(remoteRoot, absolute)}`] = absolute;
    }
  };
  walk(remoteRoot);
  return files;
}

describeWithToolchain("sign-ocr-index scripts", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = new Sandbox();
    writeVerifiedBuildOutputs(box);
  });
  afterEach(() => box.cleanup());

  it("indexes both verified targets and the full attestation set", () => {
    const result = box.run("create-unsigned-ocr-index.sh", indexEnv);
    expect(result.status, result.output).toBe(0);

    const raw = readFileSync(box.path("ocr-index", "ocr-runtime-index.unsigned.json"), "utf8");
    const index = JSON.parse(raw);
    expect(raw).toBe(canonical(index));
    expect(index.schemaVersion).toBe(1);
    expect(index.version).toBe(VERSION);
    expect(index.artifacts.map((artifact: { target: string }) => artifact.target)).toEqual(
      [...TARGET_NAMES].sort(),
    );
    expect(index.attestations.map((entry: { file: string }) => entry.file)).toEqual(
      [...ATTESTATIONS].sort(),
    );
  });

  it("refuses artifacts built from a different release commit", () => {
    const result = box.run("create-unsigned-ocr-index.sh", {
      ...indexEnv,
      SNAPOTTER_RELEASE_COMMIT: "e".repeat(40),
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("invalid build provenance for linux-amd64-cpu-py312");
    expect(existsSync(box.path("ocr-index", "ocr-runtime-index.unsigned.json"))).toBe(false);
  });

  it("refuses an archive whose bytes no longer match its metadata", () => {
    const archive = box.path("ocr-artifacts", "ocr-linux-arm64-cpu-py311.tar.gz");
    const bytes = readFileSync(archive);
    bytes[0] ^= 0xff;
    writeFileSync(archive, bytes);

    const result = box.run("create-unsigned-ocr-index.sh", indexEnv);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("archive digest mismatch for linux-arm64-cpu-py311");
  });

  it("refuses a missing attestation", () => {
    rmSync(box.path("ocr-attestations", "ocr-linux-amd64-cpu-py312-trivy.json"));
    const result = box.run("create-unsigned-ocr-index.sh", indexEnv);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("OCR attestation set mismatch");
  });

  it("refuses to sign with a key the repository does not trust", () => {
    expect(box.run("create-unsigned-ocr-index.sh", indexEnv).status).toBe(0);
    const { privateKey } = generateKeyPairSync("ed25519");
    const untrusted = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

    const result = box.run("sign-ocr-index.sh", {
      OCR_RUNTIME_INDEX_SIGNING_KEY_B64: Buffer.from(untrusted).toString("base64"),
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Signing key does not match the repository-trusted public key");
    expect(existsSync(box.path("ocr-index", "ocr-runtime-index.signature"))).toBe(false);
  });
});

describeWithToolchain("publish: organize the signed OCR release closure", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = new Sandbox();
    signAndStageRelease(box);
  });
  afterEach(() => box.cleanup());

  it("writes a canonical manifest binding every signed object", () => {
    const result = box.run("organize-ocr-release-closure.sh");
    expect(result.status, result.output).toBe(0);

    const raw = readFileSync(path.join(box.upload, "manifest.json"), "utf8");
    const manifest = JSON.parse(raw);
    expect(raw).toBe(canonical(manifest));
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.version).toBe(VERSION);
    const expected = [
      ...TARGET_NAMES.flatMap((target) => [
        `ocr-${target}.artifact.json`,
        `ocr-${target}.tar.gz`,
        `ocr-${target}.tar.gz.sha256`,
      ]),
      ...ATTESTATIONS,
      "ocr-runtime-index.json",
      "ocr-runtime-trusted-keys.json",
    ].map((name) => `v3/${name}`);
    expect(manifest.files.map((entry: { file: string }) => entry.file)).toEqual(expected.sort());
    for (const entry of manifest.files as Array<{ file: string; sha256: string; size: number }>) {
      const bytes = readFileSync(path.join(box.upload, entry.file));
      expect(entry.sha256).toBe(sha256(bytes));
      expect(entry.size).toBe(bytes.length);
    }
  });

  it("refuses an OCR object the signed index does not name", () => {
    writeFileSync(box.path("artifacts", "ocr-attestations", "ocr-stray.json"), "{}\n");
    const result = box.run("organize-ocr-release-closure.sh");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("unexpected OCR release objects: ['ocr-stray.json']");
  });

  it("refuses an archive changed after signing", () => {
    const archive = box.path(
      "artifacts",
      "ocr-linux-amd64-cpu-py312",
      "ocr-linux-amd64-cpu-py312.tar.gz",
    );
    appendFileSync(archive, "tampered");
    const result = box.run("organize-ocr-release-closure.sh");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Signed OCR archive bytes mismatch: linux-amd64-cpu-py312");
  });

  it("refuses an index signed under a different key identity", () => {
    const result = box.run("organize-ocr-release-closure.sh", {
      OCR_RUNTIME_INDEX_KEY_ID: "someone-else",
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("untrusted signature identity");
  });

  it("refuses an index whose signature the configured public key rejects", () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const otherPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const result = box.run("organize-ocr-release-closure.sh", {
      OCR_RUNTIME_INDEX_PUBLIC_KEY_PEM_B64: Buffer.from(otherPem).toString("base64"),
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Candidate OCR runtime index signature is invalid");
  });
});

describeWithToolchain("publish: refuse to mutate an existing version", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = new Sandbox();
    organizeRelease(box);
  });
  afterEach(() => box.cleanup());

  const run = () => box.run("refuse-existing-version.sh", { HF_TOKEN: "hf_test" });

  it("allows a fresh version and pins the snapshot as the upload parent", () => {
    const result = run();
    expect(result.status, result.output).toBe(0);
    expect(box.githubEnvLines()).toEqual([`HF_PARENT_COMMIT=${HF_SNAPSHOT}`]);
    expect(box.hfCalls("file_exists")).toEqual([
      expect.objectContaining({ filename: `v${VERSION}/manifest.json`, revision: HF_SNAPSHOT }),
    ]);
  });

  it("refuses a manifestless version prefix that already holds objects", () => {
    box.setHf({ files: { [`v${VERSION}/v3/ocr-runtime-index.json`]: box.path("github-env") } });
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "Refusing to publish into an existing feature-bundle version without a manifest",
    );
    expect(box.githubEnvLines()).not.toContain("BUNDLE_RELEASE_EXISTS=true");
  });

  it("treats an identical, verified existing release as already published", () => {
    box.setHf({ files: publishCandidateRemotely(box) });
    const result = run();
    expect(result.status, result.output).toBe(0);
    expect(box.githubEnvLines()).toEqual([
      `HF_PARENT_COMMIT=${HF_SNAPSHOT}`,
      "BUNDLE_RELEASE_EXISTS=true",
    ]);
  });

  it("refuses an existing release with different runtime bytes", () => {
    const files = publishCandidateRemotely(box);
    const remoteManifest = files[`v${VERSION}/manifest.json`];
    const manifest = JSON.parse(readFileSync(remoteManifest, "utf8"));
    const archive = manifest.files.find(
      (entry: { file: string }) => entry.file === "v3/ocr-linux-amd64-cpu-py312.tar.gz",
    );
    archive.sha256 = sha256("different runtime");
    writeFileSync(remoteManifest, canonical(manifest));
    box.setHf({ files });

    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain(
      "Refusing to replace an existing feature-bundle version with different runtime bytes",
    );
    expect(box.githubEnvLines()).not.toContain("BUNDLE_RELEASE_EXISTS=true");
  });

  it("refuses when the repository moves during the audit", () => {
    box.setHf({ files: publishCandidateRemotely(box), mainShas: [HF_SNAPSHOT, "f".repeat(40)] });
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Hugging Face repository changed during release audit");
    expect(box.githubEnvLines()).not.toContain("BUNDLE_RELEASE_EXISTS=true");
  });

  it("refuses a snapshot that is not an immutable commit", () => {
    box.setHf({ mainShas: ["main"] });
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("did not resolve to an immutable revision");
    expect(box.githubEnvLines()).toEqual([]);
  });
});

describeWithToolchain("publish: upload only after every gate passed", () => {
  let box: Sandbox;
  beforeEach(() => {
    box = new Sandbox();
    organizeRelease(box);
  });
  afterEach(() => box.cleanup());

  const run = (env: Record<string, string> = {}) =>
    box.run("upload-verified-bundles.sh", {
      HF_TOKEN: "hf_test",
      HF_PARENT_COMMIT: HF_SNAPSHOT,
      RELEASE_COMMIT,
      ...env,
    });

  it("uploads once against the audited parent and verifies the published closure", () => {
    const result = run();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(
      `Published: https://huggingface.co/deepsafe/feature-bundles/tree/${HF_PUBLISHED}/v${VERSION}`,
    );
    expect(box.hfCalls("upload_folder")).toEqual([
      {
        call: "upload_folder",
        repo_id: "deepsafe/feature-bundles",
        path_in_repo: `v${VERSION}`,
        revision: "main",
        parent_commit: HF_SNAPSHOT,
      },
    ]);
    expect(box.gitCalls()[0]).toBe(
      `fetch --force --no-tags origin refs/tags/v${VERSION}:refs/snapotter/hf-publish-boundary-tag`,
    );
  });

  it("refuses to upload when the release tag moved", () => {
    const result = run({ GIT_STUB_TAG: "e".repeat(40) });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Release tag changed before Hugging Face publication");
    expect(box.hfCalls("upload_folder")).toEqual([]);
  });

  it("refuses to upload without an immutable parent commit", () => {
    const result = run({ HF_PARENT_COMMIT: "main" });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Hugging Face parent revision is not an immutable commit");
    expect(box.hfCalls("upload_folder")).toEqual([]);
    expect(box.gitCalls()).toEqual([]);
  });

  it("refuses to upload a file the manifest does not bind", () => {
    writeFileSync(path.join(box.upload, "v3", "unlisted.bin"), "extra");
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Candidate feature-bundle manifest closure mismatch");
    expect(box.hfCalls("upload_folder")).toEqual([]);
  });

  it("fails when the repository moves right after the upload", () => {
    box.setHf({ mainShasAfterUpload: ["f".repeat(40)] });
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("Hugging Face repository changed during post-upload audit");
    expect(box.hfCalls("upload_folder")).toHaveLength(1);
  });
});
