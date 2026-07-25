import { type ChildProcess, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
vi.mock("../../../packages/media-engine/src/binaries.js", () => ({
  resolveFfprobe: vi.fn(() => "/usr/bin/ffprobe"),
}));
vi.mock("@snapotter/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@snapotter/shared")>()),
  wrapWithMemoryLimit: vi.fn((bin: string, args: string[]) => [bin, args]),
}));

function createMockProcess(): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  Object.assign(child, {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    killed: false,
    kill: vi.fn(() => {
      (child as { killed: boolean }).killed = true;
      return true;
    }),
  });
  return child;
}

describe("probeMedia cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kills ffprobe and rejects with AbortError when its signal is aborted", async () => {
    const child = createMockProcess();
    vi.mocked(spawn).mockReturnValue(child);
    const { probeMedia } = await import("../../../packages/media-engine/src/ffprobe.js");
    const controller = new AbortController();

    const result = probeMedia("/tmp/video.mp4", { signal: controller.signal });
    controller.abort("job canceled");
    child.emit("close", 0, null);

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("does not spawn ffprobe for an already-aborted signal", async () => {
    const { probeMedia } = await import("../../../packages/media-engine/src/ffprobe.js");
    const controller = new AbortController();
    controller.abort("job canceled");

    await expect(probeMedia("/tmp/video.mp4", { signal: controller.signal })).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(spawn).not.toHaveBeenCalled();
  });
});
