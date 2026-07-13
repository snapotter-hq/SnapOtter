import { afterEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

import { deployMode } from "../../../apps/api/src/lib/deploy-mode.js";

describe("deployMode", () => {
  const origEmbedded = process.env.EMBEDDED_MODE;

  afterEach(() => {
    if (origEmbedded === undefined) delete process.env.EMBEDDED_MODE;
    else process.env.EMBEDDED_MODE = origEmbedded;
    mockExistsSync.mockReset();
  });

  it("returns embedded when EMBEDDED_MODE is set", () => {
    process.env.EMBEDDED_MODE = "1";
    mockExistsSync.mockReturnValue(false);
    expect(deployMode()).toBe("embedded");
  });

  it("returns external when /.dockerenv exists and EMBEDDED_MODE is unset", () => {
    delete process.env.EMBEDDED_MODE;
    mockExistsSync.mockImplementation((p: string) => p === "/.dockerenv");
    expect(deployMode()).toBe("external");
  });

  it("returns native when neither signal is present", () => {
    delete process.env.EMBEDDED_MODE;
    mockExistsSync.mockReturnValue(false);
    expect(deployMode()).toBe("native");
  });

  it("prefers embedded over external when both signals are present", () => {
    process.env.EMBEDDED_MODE = "1";
    mockExistsSync.mockReturnValue(true);
    expect(deployMode()).toBe("embedded");
  });
});
