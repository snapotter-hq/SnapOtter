import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: spawnMock,
}));

import { isDecoderUnavailable } from "../../../apps/api/src/lib/format-decoders.js";
import { renderSvgToPng } from "../../../apps/api/src/lib/svg-render.js";

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
