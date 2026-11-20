/**
 * vectorize runs through createToolRoute, so the HTTP request goes through
 * BullMQ like every factory tool instead of tracing inline on the request
 * thread (#4337). A large color trace can outlast a proxy timeout; the
 * factory hands back a 202 and a job id once the sync window runs out, and
 * the job gets cancel and SSE progress.
 */
import type { FastifyInstance } from "fastify";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";

const createToolRoute = vi.hoisted(() => vi.fn());

vi.mock("../../../apps/api/src/routes/tool-factory.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../apps/api/src/routes/tool-factory.js")>()),
  createToolRoute,
}));

const { registerVectorize } = await import("../../../apps/api/src/routes/tools/vectorize.js");

describe("vectorize route (#4337)", () => {
  const post = vi.fn();

  beforeAll(() => {
    registerVectorize({ post, get: vi.fn() } as unknown as FastifyInstance);
  });

  it("registers through createToolRoute, with no inline handler", () => {
    expect(post).not.toHaveBeenCalled();
    expect(createToolRoute).toHaveBeenCalledTimes(1);
    expect(createToolRoute.mock.calls[0][1]).toMatchObject({ toolId: "vectorize" });
  });

  it("the queued process function still traces to the same SVG", async () => {
    const config = createToolRoute.mock.calls[0][1];
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ffffff" },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 16, height: 16, channels: 3, background: "#000000" },
          })
            .png()
            .toBuffer(),
          left: 8,
          top: 8,
        },
      ])
      .png()
      .toBuffer();

    const result = await config.process(png, config.settingsSchema.parse({}), "logo.png");

    expect(result.filename).toBe("logo.svg");
    expect(result.contentType).toBe("image/svg+xml");
    const svg = result.buffer.toString("utf-8");
    expect(svg).toContain("<svg");
    expect(svg).toMatch(/<path[^>]* d="M[^"]+"/);
  });
});
