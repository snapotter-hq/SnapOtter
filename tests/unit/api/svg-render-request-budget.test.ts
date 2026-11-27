import { toolInputErrorCode } from "@snapotter/shared";
import { describe, expect, it, vi } from "vitest";

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

import { enterSvgRenderRequest, renderSvgToPng } from "../../../apps/api/src/lib/svg-render.js";

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

/** A fresh async context, so enterWith in one test never reaches the next. */
function asRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      enterSvgRenderRequest();
      fn().then(resolve, reject);
    });
  });
}

describe("per-request SVG render budget (#5354)", () => {
  it("answers later distinct SVGs without spawning once one has timed out", async () => {
    await asRequest(async () => {
      const first = await renderSvgToPng(expensiveSvg("budget-a"), { deadlineMs: 400 }).catch(
        (e: unknown) => e,
      );
      expect(toolInputErrorCode(first)).toBe("SVG_TOO_COMPLEX");
      const spawned = spawnCalls.count;

      const second = await renderSvgToPng(expensiveSvg("budget-b"), { deadlineMs: 400 }).catch(
        (e: unknown) => e,
      );
      expect(toolInputErrorCode(second)).toBe("SVG_TOO_COMPLEX");
      const third = await renderSvgToPng(cheapSvg("budget-c"), { deadlineMs: 400 }).catch(
        (e: unknown) => e,
      );
      expect(toolInputErrorCode(third)).toBe("SVG_TOO_COMPLEX");
      expect(spawnCalls.count).toBe(spawned);
    });
  });

  it("does not carry the budget into another request", async () => {
    await asRequest(() =>
      renderSvgToPng(expensiveSvg("budget-d"), { deadlineMs: 400 }).catch(() => {}),
    );
    const spawned = spawnCalls.count;
    await asRequest(() => renderSvgToPng(cheapSvg("budget-e"), { deadlineMs: 400 }));
    expect(spawnCalls.count).toBe(spawned + 1);
  });

  it("keeps rendering within a request while nothing has timed out", async () => {
    await asRequest(async () => {
      const spawned = spawnCalls.count;
      await renderSvgToPng(cheapSvg("budget-f"));
      await renderSvgToPng(cheapSvg("budget-g"));
      expect(spawnCalls.count).toBe(spawned + 2);
    });
  });
});
