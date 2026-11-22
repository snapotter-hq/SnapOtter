import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = resolve(root, "scripts/test-docker.sh");
const composeFile = resolve(root, "docker/docker-compose.test.yml");
const unitOnlyUp = "up --build --exit-code-from test-unit test-unit";

/**
 * Runs scripts/test-docker.sh with `docker` stubbed by an exported bash
 * function, not a fake binary: the Docker test image mounts /tmp noexec.
 * `up` exits with upStatus; every call prints its arguments on one line.
 */
function runWithStubbedDocker(upStatus: number) {
  const stub = [
    'docker() { echo "docker $*"; if [ "$4" = up ]; then return "$UP_STATUS"; fi; }',
    "export -f docker",
    'exec bash "$SCRIPT"',
  ].join("\n");
  const result = spawnSync("bash", ["-c", stub], {
    encoding: "utf8",
    env: { ...process.env, SCRIPT: script, UP_STATUS: String(upStatus) },
  });
  const calls = result.stdout.split("\n").filter((line) => line.startsWith("docker "));
  return { status: result.status, calls };
}

// tests/unit/e2e-harness-contract.test.ts pins `pnpm test:docker` to this script.
describe("scripts/test-docker.sh", () => {
  // A whole-stack `up` creates test-e2e, whose depends_on on test-unit
  // completing can't be met once test-unit fails, and compose hung there (#5001).
  it.each([0, 1, 3])(
    "brings up only test-unit, exits with its code %i, and tears the stack down",
    (upStatus) => {
      const { status, calls } = runWithStubbedDocker(upStatus);

      expect(calls).toEqual([
        `docker compose -f ${composeFile} ${unitOnlyUp}`,
        `docker compose -f ${composeFile} down --volumes --remove-orphans`,
      ]);
      expect(status).toBe(upStatus);
    },
  );

  it("matches the nightly Docker Container E2E job's compose command", () => {
    const nightly = readFileSync(resolve(root, ".github/workflows/nightly.yml"), "utf8");
    expect(nightly).toContain(
      `run: docker compose -f docker/docker-compose.test.yml ${unitOnlyUp}\n`,
    );
  });
});
