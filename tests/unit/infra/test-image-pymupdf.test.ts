import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasFitz, pythonBin } from "../../helpers/python-gate.js";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

/** Dockerfile.test's runner stage: everything after the last FROM, comments dropped. */
function runnerStage(): string {
  const source = read("docker/Dockerfile.test");
  return source
    .slice(source.lastIndexOf("\nFROM "))
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

/** The environment entries of docker-compose.test.yml's test-unit service, comments dropped. */
function testUnitEnvironment(): string {
  const compose = read("docker/docker-compose.test.yml");
  const service = compose.slice(
    compose.indexOf("  test-unit:\n"),
    compose.indexOf("  test-e2e:\n"),
  );
  return service
    .slice(service.indexOf("    environment:\n"), service.indexOf("    depends_on:\n"))
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

const PIN = /PyMuPDF==([0-9][0-9.]*)/;

// The fitz-gated suites (pdf-to-text, sign/redact/flatten-pdf, the generated
// format and settings matrices) only run where tests/helpers/python-gate.ts
// finds PyMuPDF. PR CI shards don't install it, so the Docker test image is the
// lane that runs them, against the version users actually get (#1610).
describe("Docker test image PyMuPDF", () => {
  it("pins the same PyMuPDF as the production image", () => {
    const production = read("docker/Dockerfile").match(PIN);
    expect(production, "docker/Dockerfile should pin PyMuPDF").not.toBeNull();
    const test = runnerStage().match(PIN);
    expect(test, "Dockerfile.test's runner stage should pin PyMuPDF").not.toBeNull();
    expect(test?.[1]).toBe(production?.[1]);
  });

  it("installs it into the repo-root venv the tests and the bridge look in", () => {
    // python-gate.ts and the sidecar bridge fall back to <repo>/.venv (WORKDIR
    // /app here) before the system python3, which has no PyMuPDF. Checked in the
    // runner stage, since a venv built in the libheif builder stage is thrown away.
    const stage = runnerStage();
    expect(stage).toMatch(/^WORKDIR \/app$/m);
    expect(stage).toMatch(/python3 -m venv \/app\/\.venv(\s|$)/);
    expect(stage).toMatch(/\/app\/\.venv\/bin\/pip install[^\n]*PyMuPDF==/);
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

  it("makes the Docker lane fail rather than skip when PyMuPDF can't be found", () => {
    expect(testUnitEnvironment()).toMatch(/^\s+- REQUIRE_PYTHON_FITZ=1$/m);
  });

  it("keeps a host venv out of the build context", () => {
    const ignored = read("docker/Dockerfile.test.dockerignore").split("\n");
    expect(ignored).toContain(".venv");
  });

  // docker-compose.test.yml sets REQUIRE_PYTHON_FITZ=1, so inside the Docker
  // lane a gate that can't see PyMuPDF fails here instead of skipping every
  // fitz suite without a word, which is how #1610 went unnoticed.
  it.runIf(process.env.REQUIRE_PYTHON_FITZ === "1")(
    "finds PyMuPDF where REQUIRE_PYTHON_FITZ says it must be",
    () => {
      const probe = pythonBin
        ? spawnSync(pythonBin, ["-c", "import fitz"], { encoding: "utf8" })
        : null;
      expect(
        hasFitz,
        `python-gate resolved ${pythonBin ?? "no python"}; import fitz said: ${probe?.stderr ?? probe?.error}`,
      ).toBe(true);
    },
  );
});
