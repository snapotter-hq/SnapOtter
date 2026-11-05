import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsState = vi.hoisted(() => ({ repoVenvExists: false }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn((p: string) =>
      p.endsWith("/.venv") ? fsState.repoVenvExists : actual.existsSync(p),
    ),
  };
});

const REPO_VENV = resolve(__dirname, "../../../.venv");

describe("resolveAiVenvPath (#4304)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("PYTHON_VENV_PATH", "");
    delete process.env.PYTHON_VENV_PATH;
    fsState.repoVenvExists = false;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns PYTHON_VENV_PATH when set", async () => {
    vi.stubEnv("PYTHON_VENV_PATH", "/data/ai/venv");
    const { resolveAiVenvPath } = await import("../../../packages/ai/src/venv-path.js");
    expect(resolveAiVenvPath()).toBe("/data/ai/venv");
  });

  it("falls back to the checkout's .venv when it exists", async () => {
    fsState.repoVenvExists = true;
    const { resolveAiVenvPath } = await import("../../../packages/ai/src/venv-path.js");
    expect(resolveAiVenvPath()).toBe(REPO_VENV);
  });

  it("falls back to /opt/venv when there is no checkout .venv", async () => {
    const { resolveAiVenvPath } = await import("../../../packages/ai/src/venv-path.js");
    expect(resolveAiVenvPath()).toBe("/opt/venv");
  });

  it("hands the installer the same venv the sidecar runs from, even when the variable is unset", async () => {
    fsState.repoVenvExists = true;
    const { buildInstallerEnv } = await import("../../../packages/ai/src/bridge.js");
    expect(buildInstallerEnv().PYTHON_VENV_PATH).toBe(REPO_VENV);
  });
});
