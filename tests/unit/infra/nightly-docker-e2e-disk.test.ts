import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

// The nightly Docker Container E2E lane used to run out of space partway
// through the suite and then fail on whichever test file was loading when
// Postgres hit ENOSPC, with nothing in the log saying space was the cause. The
// job only printed headroom before the build, when it always looked fine
// (#1208).

const root = path.resolve(import.meta.dirname, "../../..");

interface Step {
  name?: string;
  if?: string;
  run?: string;
}

interface Workflow {
  jobs: Record<string, { steps?: Step[] }>;
}

function dockerE2eSteps(): Step[] {
  const workflow = load(
    readFileSync(path.join(root, ".github/workflows/nightly.yml"), "utf8"),
  ) as Workflow;
  const steps = workflow.jobs["docker-e2e"]?.steps;
  if (!steps) throw new Error("nightly.yml has no docker-e2e job steps");
  return steps;
}

function diskReportStep(): Step {
  const steps = dockerE2eSteps();
  const suiteIndex = steps.findIndex((s) => s.name === "Run container test suite");
  expect(suiteIndex, "the container suite step exists").toBeGreaterThanOrEqual(0);
  const after = steps.slice(suiteIndex + 1).find((s) => s.run?.includes("df -h /"));
  if (!after) throw new Error("no step after the container suite reports disk usage");
  return after;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function runReport(postgresLog: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "nightly-disk-"));
  tempDirs.push(dir);
  const bin = path.join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    path.join(bin, "df"),
    '#!/bin/sh\necho "Filesystem Size Used Avail Use% Mounted on"\necho "/dev/root 145G 140G 5G 97% /"\n',
  );
  writeFileSync(
    path.join(bin, "docker"),
    [
      "#!/bin/sh",
      'case "$*" in',
      '  "system df") echo "TYPE TOTAL ACTIVE SIZE RECLAIMABLE"; echo "Images 4 0 15GB 15GB" ;;',
      '  *" logs postgres"*) cat "$FAKE_PG_LOG" ;;',
      '  *) echo "unexpected docker call: $*" >&2; exit 2 ;;',
      "esac",
      "",
    ].join("\n"),
  );
  chmodSync(path.join(bin, "df"), 0o755);
  chmodSync(path.join(bin, "docker"), 0o755);
  const logFile = path.join(dir, "postgres.log");
  writeFileSync(logFile, postgresLog);

  // GitHub runs a bash `run:` step as `bash --noprofile --norc -eo pipefail`.
  const result = spawnSync(
    "bash",
    ["--noprofile", "--norc", "-eo", "pipefail", "-c", diskReportStep().run ?? ""],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_PG_LOG: logFile },
    },
  );
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe("nightly Docker Container E2E disk report (#1208)", () => {
  it("reports disk after the suite even when the suite step failed", () => {
    expect(diskReportStep().if).toBe("always()");
  });

  it("prints the root filesystem and Docker's usage", () => {
    const { status, out } = runReport("LOG:  database system is ready to accept connections\n");
    expect(status).toBe(0);
    expect(out).toContain("/dev/root 145G 140G 5G 97% /");
    expect(out).toContain("Images 4 0 15GB 15GB");
    expect(out).not.toContain("::error::");
  });

  it("fails saying Postgres ran out of space", () => {
    const { status, out } = runReport(
      'ERROR:  could not extend file "base/19991/13519": No space left on device\n',
    );
    expect(status).not.toBe(0);
    expect(out).toMatch(/::error::Postgres ran out of space/);
  });

  it("still says so when Postgres kept logging long after ENOSPC", () => {
    // Under pipefail, a grep that stops reading at the first match would
    // SIGPIPE the log writer and turn a real match into a false.
    const filler = "LOG:  checkpoint complete: wrote 12 buffers\n".repeat(50_000);
    const { status, out } = runReport(
      `ERROR:  could not write blocks 6..6 in file "base/19958/2690": No space left on device\n${filler}`,
    );
    expect(status).not.toBe(0);
    expect(out).toMatch(/::error::Postgres ran out of space/);
  });
});
