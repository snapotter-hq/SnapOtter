import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

const PIN = /PyMuPDF==([0-9][0-9.]*)/;

// The fitz-gated suites (pdf-to-text, the generated format and fuzz matrices)
// only run where tests/helpers/python-gate.ts finds PyMuPDF. PR CI shards don't
// install it, so the Docker test image is the one lane that can run them, and
// it has to run them against the version users actually get (#1610).
describe("Docker test image PyMuPDF", () => {
  it("pins the same PyMuPDF as the production image", () => {
    const production = read("docker/Dockerfile").match(PIN);
    expect(production, "docker/Dockerfile should pin PyMuPDF").not.toBeNull();
    const test = read("docker/Dockerfile.test").match(PIN);
    expect(test, "docker/Dockerfile.test should pin PyMuPDF").not.toBeNull();
    expect(test?.[1]).toBe(production?.[1]);
  });

  it("installs it into the repo-root venv the tests and the bridge look in", () => {
    // python-gate.ts and the sidecar bridge fall back to <repo>/.venv (WORKDIR
    // /app here) before the system python3, which has no PyMuPDF. A venv they
    // can't find skips every fitz test as quietly as before.
    const source = read("docker/Dockerfile.test");
    expect(source).toContain("WORKDIR /app");
    expect(source).toMatch(/python3 -m venv \/app\/\.venv\b/);
    expect(source).toMatch(/\/app\/\.venv\/bin\/pip install[^\n]*PyMuPDF==/);
  });

  it("stays off the venv paths the API treats as the AI environment", () => {
    // The API reads /opt/venv as the baked base it reseeds AI venvs from and
    // PYTHON_VENV_PATH as the venv bundle installs write into. Using either
    // would change what the feature install and reset tests see. Comments may
    // name them to say why they're avoided, so only instructions are checked.
    const instructions = read("docker/Dockerfile.test")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    expect(instructions).not.toMatch(/PYTHON_VENV_PATH/);
    expect(instructions).not.toMatch(/\/opt\/venv/);
  });

  it("keeps a host venv out of the build context", () => {
    const ignored = read("docker/Dockerfile.test.dockerignore").split("\n");
    expect(ignored).toContain(".venv");
  });
});
