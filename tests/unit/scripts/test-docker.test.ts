import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const script = resolve(root, "scripts/test-docker.sh");
const composeFile = resolve(root, "docker/docker-compose.test.yml");
const compose = `docker compose -f ${composeFile}`;

interface ComposeService {
  environment?: string[] | Record<string, string>;
  depends_on?: Record<string, unknown>;
}

function composeServices(): Record<string, ComposeService> {
  const parsed = load(readFileSync(composeFile, "utf8")) as {
    services: Record<string, ComposeService>;
  };
  return parsed.services;
}

/** A service's environment, whether the compose file lists it as `KEY=value` entries or a map. */
function environmentOf(service: ComposeService): Map<string, string> {
  const environment = service.environment ?? [];
  if (!Array.isArray(environment)) return new Map(Object.entries(environment));
  return new Map(
    environment.map((entry) => {
      const separator = entry.indexOf("=");
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

interface StubStatuses {
  build?: number;
  up?: number;
  unit?: number;
  e2e?: number;
}

/**
 * Runs scripts/test-docker.sh with `docker` stubbed by an exported bash
 * function, not a fake binary: the Docker test image mounts /tmp noexec.
 * Each step returns its status from `statuses`; every call prints its
 * arguments on one line.
 */
function runWithStubbedDocker(statuses: StubStatuses = {}) {
  const stub = [
    "docker() {",
    '  echo "docker $*"',
    '  case " $* " in',
    '    *" build "*) return "$BUILD_STATUS" ;;',
    '    *" up "*) return "$UP_STATUS" ;;',
    '    *" run --rm test-unit ") return "$UNIT_STATUS" ;;',
    '    *" run --rm test-e2e ") return "$E2E_STATUS" ;;',
    "  esac",
    "}",
    "export -f docker",
    'exec bash "$SCRIPT"',
  ].join("\n");
  const result = spawnSync("bash", ["-c", stub], {
    encoding: "utf8",
    env: {
      ...process.env,
      SCRIPT: script,
      BUILD_STATUS: String(statuses.build ?? 0),
      UP_STATUS: String(statuses.up ?? 0),
      UNIT_STATUS: String(statuses.unit ?? 0),
      E2E_STATUS: String(statuses.e2e ?? 0),
    },
  });
  const calls = result.stdout.split("\n").filter((line) => line.startsWith("docker "));
  return { status: result.status, calls };
}

const build = `${compose} build test-unit test-e2e`;
const infraUp = `${compose} up --detach --wait postgres redis`;
const unitRun = `${compose} run --rm test-unit`;
const e2eRun = `${compose} run --rm test-e2e`;
const down = `${compose} down --volumes --remove-orphans`;

// tests/unit/e2e-harness-contract.test.ts pins `pnpm test:docker` to this script.
describe("scripts/test-docker.sh", () => {
  // A whole-stack `up --exit-code-from test-unit` stopped Postgres and Redis
  // the moment test-unit exited, so test-e2e started against nothing and its
  // failure never reached the exit code (#5087).
  it("keeps Postgres and Redis up while test-unit and then test-e2e run", () => {
    const { status, calls } = runWithStubbedDocker();

    expect(calls).toEqual([build, infraUp, unitRun, e2eRun, down]);
    expect(status).toBe(0);
  });

  it.each([1, 3])("exits with test-e2e's code %i after a passing test-unit", (e2e) => {
    const { status, calls } = runWithStubbedDocker({ e2e });

    expect(calls).toEqual([build, infraUp, unitRun, e2eRun, down]);
    expect(status).toBe(e2e);
  });

  it.each([1, 3])("skips test-e2e and exits with test-unit's code %i", (unit) => {
    const { status, calls } = runWithStubbedDocker({ unit });

    expect(calls).toEqual([build, infraUp, unitRun, down]);
    expect(status).toBe(unit);
  });

  it("runs no suite when the build fails, and still tears down", () => {
    const { status, calls } = runWithStubbedDocker({ build: 2 });

    expect(calls).toEqual([build, down]);
    expect(status).toBe(2);
  });

  it("runs no suite when Postgres or Redis never turns healthy, and still tears down", () => {
    const { status, calls } = runWithStubbedDocker({ up: 1 });

    expect(calls).toEqual([build, infraUp, down]);
    expect(status).toBe(1);
  });

  it("keeps the nightly Docker Container E2E job from creating test-e2e (#5001)", () => {
    const nightly = readFileSync(resolve(root, ".github/workflows/nightly.yml"), "utf8");
    expect(nightly).toContain(
      "run: docker compose -f docker/docker-compose.test.yml up --build --exit-code-from test-unit test-unit\n",
    );
  });
});

describe("docker-compose.test.yml test-e2e service", () => {
  // The script orders the two suites. A depends_on on test-unit would make
  // `run test-e2e` start the whole unit suite again first.
  it("depends on Postgres and Redis only", () => {
    expect(Object.keys(composeServices()["test-e2e"].depends_on ?? {}).sort()).toEqual([
      "postgres",
      "redis",
    ]);
  });

  // tests/e2e-pg-create-db.cjs and tests/playwright-api-lifecycle.mjs fall back
  // to localhost:5432, which is nothing inside the container (#5087).
  it("points the e2e database helper at the compose Postgres and its database", () => {
    const services = composeServices();
    const database = environmentOf(services.postgres).get("POSTGRES_DB");
    const baseUrl = environmentOf(services["test-e2e"]).get("E2E_PG_BASE_URL");

    expect(baseUrl).toBeDefined();
    const url = new URL(baseUrl as string);
    expect(url.hostname).toBe("postgres");
    expect(url.port).toBe("5432");
    expect(url.pathname).toBe(`/${database}`);
  });
});
