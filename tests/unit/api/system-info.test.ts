import { afterEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.hoisted(() => vi.fn());
const mockDeployMode = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));
vi.mock("../../../apps/api/src/lib/deploy-mode.js", () => ({
  deployMode: mockDeployMode,
}));

import { gatherSystemProperties } from "../../../apps/api/src/lib/system-info.js";

describe("gatherSystemProperties", () => {
  const origArch = process.arch;

  afterEach(() => {
    Object.defineProperty(process, "arch", { value: origArch, configurable: true });
    mockExistsSync.mockReset();
    mockDeployMode.mockReset();
  });

  it("reports arm64 for an arm64 process", () => {
    Object.defineProperty(process, "arch", { value: "arm64", configurable: true });
    mockDeployMode.mockReturnValue("native");
    mockExistsSync.mockReturnValue(false);
    expect(gatherSystemProperties().arch).toBe("arm64");
  });

  it("reports amd64 for an x64 process", () => {
    Object.defineProperty(process, "arch", { value: "x64", configurable: true });
    mockDeployMode.mockReturnValue("native");
    mockExistsSync.mockReturnValue(false);
    expect(gatherSystemProperties().arch).toBe("amd64");
  });

  it("reports gpu_present true when /dev/nvidia0 exists", () => {
    mockExistsSync.mockImplementation((p: string) => p === "/dev/nvidia0");
    mockDeployMode.mockReturnValue("external");
    expect(gatherSystemProperties().gpu_present).toBe(true);
  });

  it("reports gpu_present false when /dev/nvidia0 is absent", () => {
    mockExistsSync.mockReturnValue(false);
    mockDeployMode.mockReturnValue("external");
    expect(gatherSystemProperties().gpu_present).toBe(false);
  });

  it("passes through deploy mode and os platform", () => {
    mockDeployMode.mockReturnValue("embedded");
    mockExistsSync.mockReturnValue(false);
    const props = gatherSystemProperties();
    expect(props.deploy_mode).toBe("embedded");
    expect(props.os_platform).toBe(process.platform);
  });
});
