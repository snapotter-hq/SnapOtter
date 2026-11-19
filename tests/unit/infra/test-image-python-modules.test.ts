import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { pythonBin } from "../../helpers/python-gate.js";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

/** Dockerfile.test's runner stage: everything after the last FROM, comments dropped. */
function runnerStage(): string {
  const source = read("docker/Dockerfile.test");
  return dropComments(source.slice(source.lastIndexOf("\nFROM ")));
}

/** The environment entries of docker-compose.test.yml's test-unit service, comments dropped. */
function testUnitEnvironment(): string {
  const compose = read("docker/docker-compose.test.yml");
  const service = compose.slice(
    compose.indexOf("  test-unit:\n"),
    compose.indexOf("  test-e2e:\n"),
  );
  return dropComments(
    service.slice(service.indexOf("    environment:\n"), service.indexOf("    depends_on:\n")),
  );
}

function dropComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

/** The `name==version` pins of every `<pip> install` in `script`, each read up to its next `&&`. */
function pipPins(script: string, pip: string): Map<string, string> {
  const pins = new Map<string, string>();
  for (let start = script.indexOf(`${pip} install`); start !== -1; ) {
    const end = script.indexOf("&&", start);
    const command = script.slice(start, end === -1 ? undefined : end);
    for (const [, name, version] of command.matchAll(/([A-Za-z][\w.-]*)==([0-9][0-9.]*)/g)) {
      pins.set(name as string, version as string);
    }
    start = script.indexOf(`${pip} install`, start + 1);
  }
  return pins;
}

/** The production image's /opt/venv pins. */
function productionPins(): Map<string, string> {
  return pipPins(dropComments(read("docker/Dockerfile")), "/opt/venv/bin/pip");
}

interface WorkflowStep {
  env?: Record<string, string>;
  run?: string;
  uses?: string;
}

function extendedMatrixSteps(): WorkflowStep[] {
  const nightly = load(read(".github/workflows/nightly.yml")) as {
    jobs: Record<string, { steps?: WorkflowStep[] }>;
  };
  return nightly.jobs["extended-matrix"]?.steps ?? [];
}

const GUARD_FILE = "tests/unit/infra/test-image-python-modules.test.ts";

// Production Python modules whose integration suites tests/helpers/python-gate.ts
// skips when it can't import them. PR CI shards install none of them, so the
// Docker test image and the nightly extended-matrix lane are where those suites
// run, against the versions users actually get (#1610, #1612). weasyprint and
// markdown join this list with #1174.
const GATED_MODULES = [
  { pkg: "PyMuPDF", module: "fitz", require: "REQUIRE_PYTHON_FITZ" },
  { pkg: "pikepdf", module: "pikepdf", require: "REQUIRE_PYTHON_PIKEPDF" },
  { pkg: "pdf2docx", module: "pdf2docx", require: "REQUIRE_PYTHON_PDF2DOCX" },
] as const;

describe("Docker test image Python modules", () => {
  const testVenvPins = () => pipPins(runnerStage(), "/app/.venv/bin/pip");

  it("installs every gated module into the repo-root venv the tests and the bridge look in", () => {
    // python-gate.ts and the sidecar bridge fall back to <repo>/.venv (WORKDIR
    // /app here) before the system python3, which has none of these. Checked in
    // the runner stage, since a venv built in the libheif builder stage is thrown away.
    const stage = runnerStage();
    expect(stage).toMatch(/^WORKDIR \/app$/m);
    expect(stage).toMatch(/python3 -m venv \/app\/\.venv(\s|$)/);
    const pins = testVenvPins();
    for (const { pkg } of GATED_MODULES) {
      expect(pins.has(pkg), `Dockerfile.test should pip install ${pkg} into /app/.venv`).toBe(true);
    }
  });

  it("pins the same versions as the production image", () => {
    const pins = testVenvPins();
    const production = productionPins();
    expect(pins.size).toBeGreaterThan(0);
    for (const [name, version] of pins) {
      expect(version, `${name} in Dockerfile.test vs docker/Dockerfile`).toBe(production.get(name));
    }
  });

  it("fails the build when a gated module won't import", () => {
    const check = runnerStage().match(/\/app\/\.venv\/bin\/python -c "import ([^"]+)"/);
    expect(check, "Dockerfile.test should import-check the venv").not.toBeNull();
    const imported = (check?.[1] ?? "").split(",").map((name) => name.trim());
    for (const { module } of GATED_MODULES) expect(imported).toContain(module);
  });

  it("stays off the venv paths the API treats as the AI environment", () => {
    // The API reads /opt/venv as the baked base it reseeds AI venvs from and
    // PYTHON_VENV_PATH as the venv bundle installs write into. Using either
    // would change what the feature install and reset tests see, and
    // PYTHON_VENV_PATH would also send the gate past /app/.venv.
    const stage = runnerStage();
    expect(stage).not.toMatch(/PYTHON_VENV_PATH/);
    expect(stage).not.toMatch(/\/opt\/venv/);
    expect(testUnitEnvironment()).not.toMatch(/PYTHON_VENV_PATH/);
  });

  it("makes the Docker lane fail rather than skip when a gated module can't be found", () => {
    const environment = testUnitEnvironment();
    for (const { require } of GATED_MODULES) {
      expect(environment).toMatch(new RegExp(`^\\s+- ${require}=1$`, "m"));
    }
  });

  it("keeps a host venv out of the build context", () => {
    const ignored = read("docker/Dockerfile.test.dockerignore").split("\n");
    expect(ignored).toContain(".venv");
  });
});

// The only job that sets FUZZ and FULL_MATRIX. Without these modules the fitz,
// pikepdf and pdf2docx tools skip in every fuzz and full-matrix pass (#1612).
describe("nightly extended-matrix lane Python modules", () => {
  const venvPins = () =>
    pipPins(
      extendedMatrixSteps()
        .map((step) => step.run ?? "")
        .join("\n"),
      ".venv/bin/pip",
    );

  it("installs every gated module into the repo-root .venv at the production pins", () => {
    const steps = extendedMatrixSteps();
    expect(steps.some((step) => /python3? -m venv \.venv(\s|$)/.test(step.run ?? ""))).toBe(true);
    const pins = venvPins();
    for (const { pkg } of GATED_MODULES) {
      expect(pins.has(pkg), `extended-matrix should pip install ${pkg} into .venv`).toBe(true);
    }
    const production = productionPins();
    for (const [name, version] of pins) {
      expect(version, `${name} in nightly.yml vs docker/Dockerfile`).toBe(production.get(name));
    }
  });

  it("proves the gate opened before the integration run, with every REQUIRE_* set", () => {
    // The lane only runs tests/integration, so this guard file would never see
    // its REQUIRE_* variables unless the lane runs it on its own.
    const steps = extendedMatrixSteps();
    const install = steps.findIndex((step) => /\.venv\/bin\/pip install/.test(step.run ?? ""));
    const guard = steps.findIndex((step) => (step.run ?? "").includes(GUARD_FILE));
    const integration = steps.findIndex((step) =>
      /vitest run tests\/integration\//.test(step.run ?? ""),
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(install);
    expect(integration).toBeGreaterThan(guard);
    for (const { require } of GATED_MODULES) {
      expect(steps[guard]?.env?.[require], `${require} on the guard step`).toBe("1");
    }
  });
});

// docker-compose.test.yml and the nightly extended-matrix lane set these, so a
// gate that can't see a module fails here instead of skipping its suites
// without a word, which is how #1610 went unnoticed.
describe("Python gate under REQUIRE_PYTHON_*", () => {
  for (const { module, require } of GATED_MODULES) {
    it.runIf(process.env[require] === "1")(
      `finds ${module} where ${require} says it must be`,
      () => {
        const probe = pythonBin
          ? spawnSync(pythonBin, ["-c", `import ${module}`], { encoding: "utf8" })
          : null;
        expect(
          probe?.status,
          `python-gate resolved ${pythonBin ?? "no python"}; import ${module} said: ${probe?.stderr ?? probe?.error}`,
        ).toBe(0);
      },
    );
  }
});
