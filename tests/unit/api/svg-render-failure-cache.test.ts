import { toolInputErrorCode } from "@snapotter/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: ((...args: Parameters<typeof actual.spawn>) => {
      spawnCalls.count += 1;
      return actual.spawn(...args);
    }) as typeof actual.spawn,
  };
});

import { renderSvgToPng } from "../../../apps/api/src/lib/svg-render.js";

/** Same shape as the hostile file in svg-render.test.ts; `tag` makes each test's bytes unique. */
const expensiveSvg = (tag: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000" data-tag="${tag}">` +
      '<defs><filter id="f"><feTurbulence baseFrequency="0.05" numOctaves="8"/><feGaussianBlur stdDeviation="20"/></filter></defs>' +
      `<rect id="r" width="2000" height="2000" filter="url(#f)"/>${'<use href="#r"/>'.repeat(40)}</svg>`,
  );

const cheapSvg = (tag: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" data-tag="${tag}"><rect width="20" height="20"/></svg>`,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("renderSvgToPng failure cache (#5345)", () => {
  it("answers a repeat of a timed-out SVG without spawning another render", async () => {
    const svg = expensiveSvg("repeat");
    const first = await renderSvgToPng(svg, { deadlineMs: 400 }).catch((e: unknown) => e);
    expect(toolInputErrorCode(first)).toBe("SVG_TOO_COMPLEX");
    const spawned = spawnCalls.count;

    const second = await renderSvgToPng(svg, { deadlineMs: 400 }).catch((e: unknown) => e);
    expect(toolInputErrorCode(second)).toBe("SVG_TOO_COMPLEX");
    expect((second as Error).message).toBe((first as Error).message);
    expect(spawnCalls.count).toBe(spawned);
  });

  it("renders again when the options differ, since a larger deadline may succeed", async () => {
    const svg = expensiveSvg("options");
    await renderSvgToPng(svg, { deadlineMs: 400 }).catch(() => {});
    const spawned = spawnCalls.count;
    await renderSvgToPng(svg, { deadlineMs: 450 }).catch(() => {});
    expect(spawnCalls.count).toBe(spawned + 1);
  });

  it("does not remember an SVG that rendered fine", async () => {
    const svg = cheapSvg("fine");
    await renderSvgToPng(svg);
    const spawned = spawnCalls.count;
    await renderSvgToPng(svg);
    expect(spawnCalls.count).toBe(spawned + 1);
  });

  it("forgets a timeout after a minute", async () => {
    const svg = expensiveSvg("expiry");
    await renderSvgToPng(svg, { deadlineMs: 400 }).catch(() => {});
    const spawned = spawnCalls.count;
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2 * 60 * 1000 });
    await renderSvgToPng(svg, { deadlineMs: 400 }).catch(() => {});
    expect(spawnCalls.count).toBe(spawned + 1);
  });
});
