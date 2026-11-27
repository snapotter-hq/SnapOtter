import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { toolInputErrorCode } from "@snapotter/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

import { env } from "../../../apps/api/src/config.js";
import { isDecoderUnavailable } from "../../../apps/api/src/lib/format-decoders.js";
import { renderSvgToPng, svgRenderDeadlineMs } from "../../../apps/api/src/lib/svg-render.js";

type FakeChild = EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

function fakeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');

let child: FakeChild;

beforeEach(() => {
  child = fakeChild();
  spawnMock.mockReset().mockReturnValue(child);
});

describe("renderSvgToPng process faults (#5153)", () => {
  it("answers ENGINE_UNAVAILABLE when the render process can't start", async () => {
    const pending = renderSvgToPng(SVG, { deadlineMs: 0 });
    child.emit(
      "error",
      Object.assign(new Error("spawn node EAGAIN"), { code: "EAGAIN", syscall: "spawn node" }),
    );

    const err = await pending.catch((e: unknown) => e);
    expect(isDecoderUnavailable(err)).toBe(true);
  });

  it("answers ENGINE_UNAVAILABLE when the render process dies on a signal it wasn't sent", async () => {
    const pending = renderSvgToPng(SVG, { deadlineMs: 0 });
    child.emit("close", null, "SIGSEGV");

    const err = await pending.catch((e: unknown) => e);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(((err as Error).cause as Error).message).toContain("SIGSEGV");
  });

  it("keeps sharp's message as a plain error when sharp rejects the file", async () => {
    const pending = renderSvgToPng(SVG, { deadlineMs: 0 });
    child.stderr.write("Input image exceeds pixel limit");
    child.emit("close", 2, null);

    const err = await pending.catch((e: unknown) => e);
    expect(isDecoderUnavailable(err)).toBe(false);
    expect((err as Error).message).toBe("Input image exceeds pixel limit");
  });

  it("hands the child only the environment libvips needs, not the API's secrets", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://user:secret@db/snapotter");
    vi.stubEnv("FONTCONFIG_PATH", "/etc/fonts");
    try {
      const pending = renderSvgToPng(SVG, { deadlineMs: 0 });
      child.stdout.write(Buffer.from("png"));
      child.emit("close", 0, null);
      await pending;

      const env = spawnMock.mock.calls[0]?.[2]?.env as NodeJS.ProcessEnv;
      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.FONTCONFIG_PATH).toBe("/etc/fonts");
      expect(env.PATH).toBe(process.env.PATH);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("renderSvgToPng hardening (#5321)", () => {
  it("kills the child and answers ENGINE_UNAVAILABLE when stdout outgrows the pixel cap", async () => {
    const pending = renderSvgToPng(SVG, { deadlineMs: 0, maxPixels: 1 });
    child.stdout.write(Buffer.alloc(2 * 1024 * 1024));
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith("SIGKILL"));
    child.emit("close", null, "SIGKILL");

    const err = await pending.catch((e: unknown) => e);
    expect(isDecoderUnavailable(err)).toBe(true);
    expect(((err as Error).cause as Error).message).toContain("more than");
  });

  it("accepts output of exactly 5 bytes per pixel plus 1 MiB and rejects one byte more", async () => {
    const cap = 5 * 1000 + 1024 * 1024;
    const accepted = renderSvgToPng(SVG, { deadlineMs: 0, maxPixels: 1000 });
    child.stdout.write(Buffer.alloc(cap));
    await new Promise<void>((resolve) => setImmediate(resolve));
    child.emit("close", 0, null);
    expect((await accepted).length).toBe(cap);

    child = fakeChild();
    spawnMock.mockReturnValue(child);
    const rejected = renderSvgToPng(SVG, { deadlineMs: 0, maxPixels: 1000 });
    child.stdout.write(Buffer.alloc(cap + 1));
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalledWith("SIGKILL"));
    child.emit("close", null, "SIGKILL");
    expect(isDecoderUnavailable(await rejected.catch((e: unknown) => e))).toBe(true);
  });

  describe("deadline", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("returns the render when the deadline fires after the child already wrote its output", async () => {
      const pending = renderSvgToPng(SVG, { deadlineMs: 1000 });
      child.stdout.write(Buffer.from("png"));
      await vi.advanceTimersByTimeAsync(1000);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
      child.emit("close", 0, null);

      expect((await pending).toString()).toBe("png");
    });

    it("answers SVG_TOO_COMPLEX when the deadline kills a child that hadn't finished", async () => {
      const pending = renderSvgToPng(SVG, { deadlineMs: 1000 });
      const settled = pending.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(1000);
      child.emit("close", null, "SIGKILL");

      expect(toolInputErrorCode(await settled)).toBe("SVG_TOO_COMPLEX");
    });
  });

  it("leaves part of the job timeout for work done before the render", () => {
    expect(svgRenderDeadlineMs()).toBeLessThan(env.JOB_TIMEOUT_FAST_S * 1000);
    expect(svgRenderDeadlineMs()).toBeGreaterThan(0);
  });

  it("kills the child when the abort signal fires", async () => {
    const controller = new AbortController();
    const pending = renderSvgToPng(SVG, { deadlineMs: 0, signal: controller.signal });
    const settled = pending.catch((e: unknown) => e);
    controller.abort(new Error("client gone"));
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");

    expect(((await settled) as Error).message).toBe("client gone");
  });
});
