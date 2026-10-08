import { vi } from "vitest";

/**
 * jsdom has no canvas and no image decoding, so the editor store's source-bitmap
 * rebakes (rotate, flip, crop, canvas size) can't run in it. This stands both in:
 * `Image` loads on the next microtask, and `<canvas>` hands back a distinct PNG data
 * URL per `toDataURL`. It records how the bitmap was drawn so a test can check where
 * it landed. Undo it with `vi.restoreAllMocks()` and `vi.unstubAllGlobals()`.
 *
 * With `manual`, image loads are held until `release()`, so a test can change the
 * editor while a decode is in flight.
 */
export type RasterDraw = {
  canvas: { width: number; height: number };
  args: number[];
  ops: string[];
};

export type RasterStubOptions = {
  loadFails?: boolean;
  dataUrl?: string;
  toDataURLThrows?: boolean;
  manual?: boolean;
};

export function stubRaster(opts: RasterStubOptions = {}) {
  const draws: RasterDraw[] = [];
  const sources: string[] = [];
  // The crossOrigin each decoded Image had when its src was set, in the same order.
  const crossOrigins: Array<string | null> = [];
  const held: Array<() => void> = [];
  let produced = 0;
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return realCreate(tag);
    const ops: string[] = [];
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        translate: (x: number, y: number) => ops.push(`translate ${x} ${y}`),
        rotate: (a: number) => ops.push(`rotate ${a}`),
        scale: (x: number, y: number) => ops.push(`scale ${x} ${y}`),
        drawImage: (_img: unknown, ...args: number[]) =>
          draws.push({ canvas, args, ops: [...ops] }),
      }),
      toDataURL: () => {
        if (opts.toDataURLThrows) throw new DOMException("tainted canvas", "SecurityError");
        return opts.dataUrl ?? `data:image/png;base64,REBAKED${++produced}`;
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      crossOrigin: string | null = null;
      set src(v: string) {
        sources.push(v);
        crossOrigins.push(this.crossOrigin);
        const fire = () => (opts.loadFails ? this.onerror?.() : this.onload?.());
        if (opts.manual) held.push(fire);
        else queueMicrotask(fire);
      }
    },
  );
  return {
    draws,
    sources,
    crossOrigins,
    release: () => {
      while (held.length) held.shift()?.();
    },
  };
}
