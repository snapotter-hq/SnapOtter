// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Assertions match shell interpolation syntax as literal text.
import { spawnSync } from "node:child_process";
import {
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
  RELEASE_SCRIPT_REFERENCE,
  releaseScriptPath,
  releaseWorkflowPath,
} from "../../helpers/release-workflow.js";

const root = process.cwd();
const scriptsDir = path.resolve(root, "scripts/release");
const workflowsDir = path.resolve(root, ".github/workflows");

interface Step {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}
interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

const MAX_INLINE_RUN_LINES = 30;

/**
 * Steps allowed to keep a longer inline body, with the reason. "Check for new
 * release" checks out the release commit partway through, which would rewrite
 * a script file in the working tree while bash is still reading it.
 */
const INLINE_RUN_EXCEPTIONS = new Set(["release / Check for new release"]);

function releaseWorkflow(): Workflow {
  return load(readFileSync(releaseWorkflowPath(root), "utf8")) as Workflow;
}

function runLineCount(run: string): number {
  return run.replace(/\n$/, "").split("\n").length;
}

/** Same probe as the reuse-digest harness: GitHub's runners have all three. */
const releaseShellReady =
  spawnSync("bash", ["-c", "type mapfile && command -v jq && command -v sha256sum"], {
    stdio: "ignore",
  }).status === 0;
const inCI = process.env.CI === "true";

describe("release.yml step scripts (#4452)", () => {
  it(`keeps every inline run block at ${MAX_INLINE_RUN_LINES} lines or fewer`, () => {
    const oversized: string[] = [];
    for (const [jobName, job] of Object.entries(releaseWorkflow().jobs)) {
      for (const step of job.steps ?? []) {
        if (typeof step.run !== "string") continue;
        const label = `${jobName} / ${step.name}`;
        const lines = runLineCount(step.run);
        if (lines > MAX_INLINE_RUN_LINES && !INLINE_RUN_EXCEPTIONS.has(label)) {
          oversized.push(`${label} (${lines} lines)`);
        }
      }
    }
    expect(oversized, "move these step bodies into scripts/release/").toEqual([]);
  });

  it("only lists exceptions that still need one", () => {
    for (const label of INLINE_RUN_EXCEPTIONS) {
      const [jobName, stepName] = label.split(" / ");
      const step = releaseWorkflow().jobs[jobName]?.steps?.find((s) => s.name === stepName);
      expect(step?.run, `${label} no longer exists`).toBeTypeOf("string");
      expect(runLineCount(step?.run ?? "")).toBeGreaterThan(MAX_INLINE_RUN_LINES);
    }
  });

  it("calls only scripts that exist, after a full checkout of the repository", () => {
    const calls: string[] = [];
    for (const [jobName, job] of Object.entries(releaseWorkflow().jobs)) {
      let checkedOut = false;
      for (const step of job.steps ?? []) {
        if (step.uses?.startsWith("actions/checkout@")) {
          // A sparse checkout would leave scripts/release/ out of the tree.
          checkedOut = step.with?.["sparse-checkout"] === undefined;
        }
        const reference = step.run?.match(RELEASE_SCRIPT_REFERENCE);
        if (!reference) continue;
        calls.push(reference[1]);
        expect(checkedOut, `${jobName} / ${step.name} runs before a full checkout`).toBe(true);
        expect(existsSync(releaseScriptPath(root, reference[1])), reference[1]).toBe(true);
      }
    }
    expect(calls.length).toBeGreaterThan(0);
  });

  it("has no scripts/release file that no workflow calls", () => {
    const workflows = readdirSync(workflowsDir)
      .filter((file) => /\.ya?ml$/.test(file))
      .map((file) => readFileSync(path.join(workflowsDir, file), "utf8"))
      .join("\n");
    for (const file of readdirSync(scriptsDir)) {
      expect(workflows, `scripts/release/${file} is not called`).toContain(
        `scripts/release/${file}`,
      );
    }
  });

  it("keeps step scripts executable, -e only, and free of workflow expressions", () => {
    for (const file of readdirSync(scriptsDir).filter((name) => name.endsWith(".sh"))) {
      const scriptPath = path.join(scriptsDir, file);
      const script = readFileSync(scriptPath, "utf8");
      expect(script.startsWith("#!/usr/bin/env bash\n"), file).toBe(true);
      // An unspecified run shell is `bash -e`: no pipefail, no nounset.
      expect(script, file).toMatch(/^set -e$/m);
      expect(script, file).not.toMatch(/^set -[a-z]*[uo]/m);
      // ${{ }} is only expanded in the workflow; it must arrive through env.
      expect(script, file).not.toContain("${{");
      expect(statSync(scriptPath).mode & 0o111, `${file} is not executable`).not.toBe(0);
    }
  });
});

/**
 * Runs a scripts/release/ step script with stub `gh`, `git`, `docker` and
 * `python3` executables first on PATH. Each stub appends its argv to
 * calls.log and answers from files under the fixture directory.
 */
class StepHarness {
  readonly dir = mkdtempSync(path.join(tmpdir(), "snapotter-release-step-"));
  readonly bin = path.join(this.dir, "bin");
  readonly log = path.join(this.dir, "calls.log");
  readonly output = path.join(this.dir, "github-output");

  constructor(stubs: Record<string, string>) {
    mkdirSync(this.bin);
    for (const [name, body] of Object.entries(stubs)) {
      writeFileSync(
        path.join(this.bin, name),
        `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s %s\\n' "${name}" "$*" >> "\${STUB_LOG}"\n${body}\n`,
        { mode: 0o755 },
      );
    }
  }

  run(script: string, env: Record<string, string>) {
    const result = spawnSync("bash", ["--noprofile", "--norc", releaseScriptPath(root, script)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${this.bin}:${process.env.PATH ?? ""}`,
        GITHUB_OUTPUT: this.output,
        GITHUB_REPOSITORY: "snapotter-hq/SnapOtter",
        STUB_DIR: this.dir,
        STUB_LOG: this.log,
        ...env,
      },
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls: existsSync(this.log) ? readFileSync(this.log, "utf8") : "",
      output: existsSync(this.output) ? readFileSync(this.output, "utf8") : "",
    };
  }

  cleanup() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

const releaseCommit = "a".repeat(40);
const amd64 = "1".repeat(64);
const arm64 = "2".repeat(64);

describe.runIf(releaseShellReady || inCI)("release step script behaviour", () => {
  it("has the shell tools the release steps assume", () => {
    expect(releaseShellReady, "CI must provide bash 4+, jq and sha256sum").toBe(true);
  });

  describe("publish-image-aliases.sh", () => {
    let harness: StepHarness;
    beforeEach(() => {
      harness = new StepHarness({
        git: [
          'if [[ "$1" == "rev-parse" && "$2" == "HEAD" ]]; then echo "${MOCK_HEAD}"; exit 0; fi',
          'if [[ "$1" == "rev-parse" ]]; then echo "${MOCK_TAG_COMMIT}"; exit 0; fi',
          "exit 0",
        ].join("\n"),
        // Stands in for /tmp/eligible-image-aliases.py, which the evaluator test covers.
        python3: 'printf \'%s\' "${MOCK_ALIASES}" > "${ALIAS_OUTPUT}"',
        docker: "exit 0",
      });
    });
    afterEach(() => harness.cleanup());

    const run = (registry: "dockerhub" | "ghcr", overrides: Record<string, string> = {}) =>
      harness.run("publish-image-aliases.sh", {
        ALIAS_IMAGE:
          registry === "dockerhub" ? "snapotter/snapotter" : "ghcr.io/snapotter-hq/snapotter",
        ALIAS_REGISTRY_LABEL: registry === "dockerhub" ? "Docker Hub" : "GHCR",
        ALIAS_OUTPUT: path.join(harness.dir, `${registry}-aliases`),
        MOCK_ALIASES: "2.4\n2\nlatest\n",
        MOCK_HEAD: releaseCommit,
        MOCK_TAG_COMMIT: releaseCommit,
        PLATFORM_DIGESTS: `${amd64},${arm64}`,
        RELEASE_COMMIT: releaseCommit,
        VERSION: "2.4.0",
        ...overrides,
      });

    it("points every eligible alias of each registry at both approved digests", () => {
      const dockerHub = run("dockerhub");
      expect(dockerHub.status).toBe(0);
      expect(dockerHub.calls).toContain("git fetch --force --prune --prune-tags --tags origin");
      expect(dockerHub.calls).toContain(
        `docker buildx imagetools create -t snapotter/snapotter:2.4 -t snapotter/snapotter:2 -t snapotter/snapotter:latest snapotter/snapotter@sha256:${amd64} snapotter/snapotter@sha256:${arm64}\n`,
      );

      rmSync(harness.log);
      const ghcr = run("ghcr", { MOCK_ALIASES: "2.4\n" });
      expect(ghcr.status).toBe(0);
      expect(ghcr.calls).toContain(
        `docker buildx imagetools create -t ghcr.io/snapotter-hq/snapotter:2.4 ghcr.io/snapotter-hq/snapotter@sha256:${amd64} ghcr.io/snapotter-hq/snapotter@sha256:${arm64}\n`,
      );
    });

    it("publishes nothing when no alias is eligible", () => {
      const result = run("dockerhub", { MOCK_ALIASES: "" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "No non-regressing Docker Hub aliases are eligible for v2.4.0.",
      );
      expect(result.calls).not.toContain("docker ");
    });

    it("refuses to publish when the remote tag moved off the approved commit", () => {
      const result = run("ghcr", { MOCK_TAG_COMMIT: "b".repeat(40) });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Remote release tag moved before GHCR alias publication");
      expect(result.calls).not.toContain("python3 ");
      expect(result.calls).not.toContain("docker ");
    });

    it("refuses an alias outside the moving-alias grammar", () => {
      const result = run("dockerhub", { MOCK_ALIASES: "2.4\nlatest;rm\n" });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("Freshness evaluator returned an invalid Docker Hub alias");
      expect(result.calls).not.toContain("docker ");
    });

    it("refuses an incomplete or malformed digest closure", () => {
      for (const digests of [amd64, `${amd64},not-a-digest`]) {
        const result = run("dockerhub", { PLATFORM_DIGESTS: digests });
        expect(result.status, digests).toBe(1);
        expect(result.calls, digests).not.toContain("docker ");
      }
    });
  });

  describe("persist-platform-digest.sh", () => {
    // The step reads and writes these fixed runner paths; keep them per test.
    const version = "9.8.7";
    const assetName = `snapotter-v${version}-linux-amd64.digest`;
    const localDigest = `/tmp/release-digests/${assetName}`;
    const scratch = [localDigest, `/tmp/existing-${assetName}`, "/tmp/platform-digest-asset-ids"];
    let harness: StepHarness;
    beforeEach(() => {
      mkdirSync("/tmp/release-digests", { recursive: true });
      writeFileSync(localDigest, `sha256:${amd64}\n`);
      harness = new StepHarness({
        gh: [
          'if [[ "$1" == "release" && "$2" == "view" ]]; then echo 4242; exit 0; fi',
          'if [[ "$1" == "release" && "$2" == "upload" ]]; then exit 0; fi',
          'if [[ " $* " == *" --jq "* ]]; then printf "%s" "${MOCK_ASSET_IDS}"; exit 0; fi',
          'if [[ " $* " == *"releases/assets/"* ]]; then printf "%s" "${MOCK_EXISTING_DIGEST}"; exit 0; fi',
          "exit 3",
        ].join("\n"),
      });
    });
    afterEach(() => {
      harness.cleanup();
      for (const file of scratch) rmSync(file, { force: true });
    });

    const run = (overrides: Record<string, string>) =>
      harness.run("persist-platform-digest.sh", {
        MOCK_ASSET_IDS: "",
        MOCK_EXISTING_DIGEST: "",
        PLATFORM_PAIR: "linux-amd64",
        VERSION: version,
        ...overrides,
      });

    it("uploads the digest when the release has no checkpoint yet", () => {
      const result = run({});
      expect(result.status).toBe(0);
      expect(result.calls).toContain(
        `gh release upload v${version} ${localDigest} --repo snapotter-hq/SnapOtter`,
      );
    });

    it("accepts an identical existing checkpoint without uploading", () => {
      const result = run({ MOCK_ASSET_IDS: "77\n", MOCK_EXISTING_DIGEST: `sha256:${amd64}\n` });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `Verified existing immutable GitHub release asset ${assetName}.`,
      );
      expect(result.calls).not.toContain("release upload");
    });

    it("refuses a checkpoint that records a different digest", () => {
      const result = run({ MOCK_ASSET_IDS: "77\n", MOCK_EXISTING_DIGEST: `sha256:${arm64}\n` });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "Existing GitHub release platform digest differs for linux-amd64",
      );
      expect(result.calls).not.toContain("release upload");
    });

    it("refuses duplicate checkpoints", () => {
      const result = run({ MOCK_ASSET_IDS: "77\n78\n" });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(`GitHub release contains duplicate ${assetName} assets`);
      expect(result.calls).not.toContain("release upload");
    });
  });

  describe("recover-platform-digests.sh", () => {
    // The step owns these fixed runner paths, so each test resets them.
    const version = "9.8.7";
    const resetPaths = () => {
      for (const dir of ["/tmp/digests", "/tmp/release-digest-assets"]) {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    let harness: StepHarness;
    beforeEach(() => {
      resetPaths();
      harness = new StepHarness({
        // `gh release download ... --dir DIR`: copy the fixture assets into DIR.
        gh: [
          'if [[ "$1" == "release" && "$2" == "download" ]]; then',
          '  while (( $# > 0 )); do [[ "$1" == "--dir" ]] && dir="$2"; shift; done',
          '  cp "${STUB_DIR}"/assets/* "${dir}/" 2>/dev/null || true',
          "  exit 0",
          "fi",
          "exit 3",
        ].join("\n"),
      });
      mkdirSync(path.join(harness.dir, "assets"));
    });
    afterEach(() => {
      harness.cleanup();
      resetPaths();
    });

    const writeAsset = (platform: string, contents: string) =>
      writeFileSync(
        path.join(harness.dir, "assets", `snapotter-v${version}-${platform}.digest`),
        contents,
      );
    const run = () =>
      harness.run("recover-platform-digests.sh", { GITHUB_TOKEN: "test", VERSION: version });

    it("keeps valid action artifacts without touching the release", () => {
      mkdirSync("/tmp/digests");
      writeFileSync(`/tmp/digests/${arm64}`, "");
      writeFileSync(`/tmp/digests/${amd64}`, "");
      const result = run();
      expect(result.status).toBe(0);
      expect(result.calls).toBe("");
      expect(result.output).toBe(`platform_digests=${amd64},${arm64}\n`);
    });

    it("recovers both checkpoints from the release when the artifacts expired", () => {
      writeAsset("linux-amd64", `sha256:${amd64}\n`);
      writeAsset("linux-arm64", `sha256:${arm64}\n`);
      const result = run();
      expect(result.status).toBe(0);
      expect(result.calls).toContain(
        `gh release download v${version} --pattern snapotter-v${version}-linux-*.digest --dir /tmp/release-digest-assets --repo snapotter-hq/SnapOtter`,
      );
      expect(result.output).toBe(`platform_digests=${amd64},${arm64}\n`);
      expect(readdirSync("/tmp/digests").sort()).toEqual([amd64, arm64]);
    });

    it("replaces a partial artifact download with the release checkpoints", () => {
      mkdirSync("/tmp/digests");
      writeFileSync(`/tmp/digests/${"3".repeat(64)}`, "");
      writeAsset("linux-amd64", `sha256:${amd64}\n`);
      writeAsset("linux-arm64", `sha256:${arm64}\n`);
      const result = run();
      expect(result.status).toBe(0);
      expect(result.output).toBe(`platform_digests=${amd64},${arm64}\n`);
    });

    it("refuses a missing or malformed release checkpoint", () => {
      writeAsset("linux-amd64", `sha256:${amd64}\n`);
      const missing = run();
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain(
        "Expected exactly two immutable platform digest release assets",
      );

      resetPaths();
      writeAsset("linux-arm64", `sha256:${arm64}`);
      const unterminated = run();
      expect(unterminated.status).toBe(1);
      expect(unterminated.stdout).toContain("Invalid immutable linux-arm64 digest release asset");
      expect(unterminated.output).toBe("");
    });
  });
});
