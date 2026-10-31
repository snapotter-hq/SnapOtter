// @vitest-environment jsdom
/**
 * Rotate, flip and crop rebuild the source bitmap like Canvas Size does (#2016):
 * build it first, commit size, objects and bitmap in one step, drop the result if
 * the image changed underneath, and reject (leaving the editor alone) when the
 * bitmap can't be built (#2070).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("zustand/middleware", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, persist: (config: unknown) => config };
});

import { restoreAutosave } from "@/components/editor/common/export-dialog";
import { runEditorAction } from "@/lib/editor-action";
import {
  cancelPendingRebakes,
  jumpEditorToHistoryState,
  redoEditor,
  undoEditor,
  useEditorStore,
} from "@/stores/editor-store";
import type { CanvasObject } from "@/types/editor";
import { type RasterStubOptions, stubRaster } from "../../helpers/editor-raster-stub.js";

const flush = () => new Promise((r) => setTimeout(r, 0));
const s = () => useEditorStore.getState();

const rect = (): CanvasObject => ({
  id: "r1",
  type: "rect",
  layerId: s().activeLayerId,
  attrs: {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    fill: "#f00",
    stroke: "#000",
    strokeWidth: 1,
    cornerRadius: 0,
    rotation: 0,
    opacity: 1,
  },
});

const CROP = { x: 100, y: 50, width: 300, height: 200, aspectRatio: null };

const ACTIONS: Array<[string, () => Promise<boolean>]> = [
  ["rotate 90", () => s().rotateCanvas(90)],
  ["rotate 180", () => s().rotateCanvas(180)],
  ["flip horizontal", () => s().flipCanvasHorizontal()],
  ["flip vertical", () => s().flipCanvasVertical()],
  [
    "crop",
    () => {
      s().setCropState(CROP);
      return s().applyCrop();
    },
  ],
  ["trim", () => s().trimCanvas()],
];

beforeEach(() => {
  // History is the store's own singleton, so start each test from an empty one.
  useEditorStore.temporal.getState().clear();
  s().loadImage("blob:test", 800, 600);
  s().addObject(rect());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a rebake that cannot be built leaves the editor untouched", () => {
  const failures: Array<[string, RasterStubOptions]> = [
    ["the source cannot reload", { loadFails: true }],
    ["the canvas is tainted by a cross-origin image", { toDataURLThrows: true }],
    ["the browser hands back an empty data URL", { dataUrl: "data:," }],
  ];

  for (const [action, run] of ACTIONS) {
    it.each(failures)(`${action}: rejects when %s`, async (_why, opts) => {
      stubRaster(opts);
      const before = s();
      await expect(run()).rejects.toThrow();
      const after = s();
      expect(after.canvasSize).toEqual({ width: 800, height: 600 });
      expect(after.sourceImageUrl).toBe("blob:test");
      expect(after.objects).toBe(before.objects);
      expect(after._historyVersion).toBe(before._historyVersion);
      // A failed crop stays open so the user can retry or cancel.
      if (action === "crop") expect(after.cropState).toEqual(CROP);
    });
  }
});

describe("size, objects and bitmap commit together", () => {
  it("rotate 90 changes nothing until the bitmap is ready, then everything at once", async () => {
    const raster = stubRaster({ manual: true });
    const before = s()._historyVersion;
    const pending = s().rotateCanvas(90);
    await flush();
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");

    raster.release();
    await expect(pending).resolves.toBe(true);
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s()._historyVersion).toBe(before + 1);
  });

  it("trim changes nothing until the bitmap is ready, then everything at once", async () => {
    const raster = stubRaster({ manual: true });
    const before = s()._historyVersion;
    const pending = s().trimCanvas();
    await flush();
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");

    raster.release();
    await expect(pending).resolves.toBe(true);
    expect(s().canvasSize).toEqual({ width: 102, height: 52 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s()._historyVersion).toBe(before + 1);
  });

  it("rotate 90 draws the old bitmap through a quarter turn onto a swapped canvas", async () => {
    const raster = stubRaster();
    await s().rotateCanvas(90);
    expect(raster.draws).toHaveLength(1);
    expect(raster.draws[0].canvas).toMatchObject({ width: 600, height: 800 });
    expect(raster.draws[0].ops).toEqual(["translate 600 0", `rotate ${Math.PI / 2}`]);
    expect(raster.draws[0].args).toEqual([0, 0, 800, 600]);
  });

  it("crop draws the source offset by the crop origin onto a canvas of the crop size", async () => {
    const raster = stubRaster();
    s().setCropState(CROP);
    await s().applyCrop();
    expect(raster.draws[0].canvas).toMatchObject({ width: 300, height: 200 });
    expect(raster.draws[0].args).toEqual([-100, -50, 800, 600]);
    expect(s().canvasSize).toEqual({ width: 300, height: 200 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s().cropState).toBeNull();
    expect(s().isCropping).toBe(false);
  });

  // The object maths predates this change; pin it so moving it behind the await
  // can't alter where things land.
  it.each([
    ["rotate 90", () => s().rotateCanvas(90), { x: 530, y: 10, width: 50, height: 100 }],
    ["rotate 180", () => s().rotateCanvas(180), { x: 690, y: 530, width: 100, height: 50 }],
    [
      "flip horizontal",
      () => s().flipCanvasHorizontal(),
      { x: 690, y: 20, width: 100, height: 50 },
    ],
    ["flip vertical", () => s().flipCanvasVertical(), { x: 10, y: 530, width: 100, height: 50 }],
    [
      "crop",
      () => {
        s().setCropState(CROP);
        return s().applyCrop();
      },
      { x: -90, y: -30, width: 100, height: 50 },
    ],
  ])("%s moves an object to the same place as before", async (_name, run, expected) => {
    stubRaster();
    await run();
    expect(s().objects[0].attrs).toMatchObject(expected);
  });

  it("transforms objects added while the bitmap was still being built", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().flipCanvasHorizontal();
    await flush();
    s().addObject({ ...rect(), id: "late" });
    raster.release();
    await pending;
    const late = s().objects.find((o) => o.id === "late");
    expect(late?.attrs).toMatchObject({ x: 690 });
  });

  it("trim offsets objects added while the bitmap was still being built", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().trimCanvas();
    await flush();
    s().addObject({ ...rect(), id: "late" });
    raster.release();
    await expect(pending).resolves.toBe(true);
    const late = s().objects.find((o) => o.id === "late");
    expect(late?.attrs).toMatchObject({ x: 1, y: 1 });
  });
});

describe("a result built from an image that has since changed is dropped", () => {
  it("canvas resize: another image was loaded while it decoded", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().resizeCanvas(1000, 800, "center");
    await flush();
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().sourceImageUrl).toBe("blob:other");
    expect(s().canvasSize).toEqual({ width: 640, height: 480 });
  });
  it("rotate: another image was loaded while it decoded", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().rotateCanvas(90);
    await flush();
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().sourceImageUrl).toBe("blob:other");
    expect(s().canvasSize).toEqual({ width: 640, height: 480 });
  });

  it("flip: another image was loaded while it decoded", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().flipCanvasVertical();
    await flush();
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().sourceImageUrl).toBe("blob:other");
    expect(s().canvasSize).toEqual({ width: 640, height: 480 });
  });

  it("trim: another image was loaded while it decoded", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().trimCanvas();
    await flush();
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().sourceImageUrl).toBe("blob:other");
    expect(s().canvasSize).toEqual({ width: 640, height: 480 });
  });

  it("crop: cancelled while it decoded", async () => {
    const raster = stubRaster({ manual: true });
    s().setCropState(CROP);
    const pending = s().applyCrop();
    await flush();
    s().setCropState(null);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");
  });

  it("crop: the box was redrawn while it decoded, so the old one is not applied", async () => {
    const raster = stubRaster({ manual: true });
    s().setCropState(CROP);
    const pending = s().applyCrop();
    await flush();
    const redrawn = { ...CROP, width: 200 };
    s().setCropState(redrawn);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    // The user's new box is still up, for them to apply or adjust.
    expect(s().cropState).toEqual(redrawn);
  });

  it("crop: switching tools while the bitmap is being built still commits the crop (#2114)", async () => {
    const raster = stubRaster({ manual: true });
    s().setTool("crop");
    s().setCropState(CROP);
    const pending = s().applyCrop();
    expect(s().cropApplying).toBe(true);
    await flush();
    s().setTool("move");
    expect(s().activeTool).toBe("move");
    expect(s().isCropping).toBe(false);
    expect(s().cropState).toEqual(CROP);
    expect(s().cropApplying).toBe(true);

    raster.release();
    await expect(pending).resolves.toBe(true);
    expect(s().canvasSize).toEqual({ width: 300, height: 200 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s().cropState).toBeNull();
    expect(s().isCropping).toBe(false);
    expect(s().cropApplying).toBe(false);
  });

  it("crop: a failed crop after switching tools cleans up its cropState (#2114)", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    s().setTool("crop");
    s().setCropState(CROP);
    const pending = s().applyCrop();
    await flush();
    s().setTool("move");
    expect(s().cropState).toEqual(CROP);
    expect(s().cropApplying).toBe(true);

    raster.release();
    await expect(pending).rejects.toThrow();
    expect(s().cropState).toBeNull();
    expect(s().isCropping).toBe(false);
    expect(s().cropApplying).toBe(false);
  });

  it("crop: a dropped crop after switching tools cleans up its cropState (#2114)", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    s().setTool("crop");
    s().setCropState(CROP);
    const cropping = s().applyCrop();
    s().setTool("move");
    expect(s().cropState).toEqual(CROP);

    raster.release();
    await expect(Promise.all([rotating, cropping])).resolves.toEqual([true, false]);
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
    expect(s().cropState).toBeNull();
    expect(s().cropApplying).toBe(false);
  });

  it("crop: File > Close while a crop is queued after switching tools resets cropApplying and cropState (#2114)", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    s().setTool("crop");
    s().setCropState(CROP);
    const cropping = s().applyCrop();
    s().setTool("move");
    await flush();

    useEditorStore.setState({
      sourceImageUrl: null,
      sourceImageSize: null,
      objects: [],
      selectedObjectIds: [],
    });
    expect(s().cropApplying).toBe(false);
    expect(s().cropState).toBeNull();

    raster.release();
    await expect(Promise.all([rotating, cropping])).resolves.toEqual([false, false]);
  });

  it("crop: a duplicate applyCrop call while already applying is ignored (#2114)", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    s().setTool("crop");
    s().setCropState(CROP);
    const first = s().applyCrop();
    const second = s().applyCrop();
    await flush();

    raster.release();
    await expect(first).rejects.toThrow();
    await expect(second).resolves.toBe(false);
    expect(raster.sources).toEqual(["blob:test"]);
    expect(s().cropState).toEqual(CROP);
    expect(s().cropApplying).toBe(false);
  });

  it("crop: redrawing and re-applying while the first crop decodes still commits after switching tools (#2114)", async () => {
    const raster = stubRaster({ manual: true });
    s().setTool("crop");
    s().setCropState(CROP);
    const first = s().applyCrop();
    await flush();

    const redrawn = { ...CROP, width: 200 };
    s().setCropState(redrawn);
    const second = s().applyCrop();
    s().setTool("move");

    raster.release();
    await expect(first).resolves.toBe(false);
    expect(s().cropState).toEqual(redrawn);
    expect(s().cropApplying).toBe(true);

    await flush();
    raster.release();
    await expect(second).resolves.toBe(true);
    expect(s().canvasSize).toEqual({ width: 200, height: 200 });
    expect(s().cropState).toBeNull();
    expect(s().cropApplying).toBe(false);
  });

  it("crop: holding Space for temporary hand tool during a failed crop preserves cropState (#2114)", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    s().setTool("crop");
    s().setCropState(CROP);
    const pending = s().applyCrop();
    await flush();

    useEditorStore.setState({ isSpaceHeld: true });
    s().setTool("hand");

    raster.release();
    await expect(pending).rejects.toThrow();
    expect(s().cropState).toEqual(CROP);
    expect(s().cropApplying).toBe(false);

    useEditorStore.setState({ isSpaceHeld: false });
    s().setTool("crop");
    expect(s().cropState).toEqual(CROP);
  });

  it("rotate: File > Close cleared the image while it decoded, and drops rebakes queued behind it", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    const flipping = s().flipCanvasHorizontal();
    const resizing = s().resizeImage(400, 300);
    await flush();
    useEditorStore.setState({
      sourceImageUrl: null,
      sourceImageSize: null,
      objects: [],
      selectedObjectIds: [],
    });
    raster.release();
    await expect(rotating).resolves.toBe(false);
    await expect(flipping).resolves.toBe(false);
    await expect(resizing).resolves.toBe(false);
    // The queued flip never even started a second decode.
    expect(raster.sources).toEqual(["blob:test"]);
    expect(s().sourceImageUrl).toBeNull();
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
  });

  it("flip: a project or autosave was restored while it decoded, even with the same source URL and canvasSize reference", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().flipCanvasHorizontal();
    const queued = s().rotateCanvas(90);
    await flush();
    restoreAutosave({
      version: 1,
      timestamp: 1,
      state: {
        canvasSize: s().canvasSize,
        layers: s().layers,
        objects: [],
        adjustments: s().adjustments,
        filters: s().filters,
        levels: s().levels,
        curves: s().curves,
        guides: [],
        sourceImageUrl: "blob:test",
        sourceImageSize: s().canvasSize,
        foregroundColor: "#000000",
        backgroundColor: "#ffffff",
      },
    });
    raster.release();
    await expect(pending).resolves.toBe(false);
    await expect(queued).resolves.toBe(false);
    expect(raster.sources).toEqual(["blob:test"]);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");
  });
});

describe("the source image is reloaded for CORS", () => {
  // Without it a cross-origin `?url=` photo taints the canvas and toDataURL throws,
  // so rotate, flip, crop and canvas size would reject on it every time.
  it.each(ACTIONS)("%s asks for an anonymous cross-origin load", async (_name, run) => {
    const raster = stubRaster();
    await run();
    expect(raster.crossOrigins).toEqual(["anonymous"]);
  });
});

describe("crop after Image Size", () => {
  it("cuts the region the user sees, not the bitmap's own pixels", async () => {
    const raster = stubRaster();
    s().resizeImage(400, 300);
    s().setCropState({ x: 40, y: 30, width: 100, height: 80, aspectRatio: null });
    await s().applyCrop();
    // The bitmap is still 800x600 underneath; it is drawn at the canvas's 400x300
    // first, as the editor shows it, so the crop box lines up with what was on screen.
    expect(raster.draws[0].args).toEqual([-40, -30, 400, 300]);
  });
});

describe("undo and redo wait for a rebake in flight", () => {
  it("Ctrl+Z pressed while a rotate decodes undoes the rotate, not the step before it", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().rotateCanvas(90);
    await flush();
    const undone = undoEditor();
    raster.release();
    await Promise.all([pending, undone]);

    // Back to where the user was before they rotated, with the shape they drew intact.
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");
    expect(s().objects.map((o) => o.id)).toEqual(["r1"]);
    // And the rotate is still there to redo.
    expect(useEditorStore.temporal.getState().futureStates).toHaveLength(1);
  });

  it("with nothing in flight, undo happens at once", () => {
    stubRaster();
    s().addObject({ ...rect(), id: "second" });
    void undoEditor();
    // Synchronous: a lone Ctrl+Z feels exactly as before.
    expect(s().objects.map((o) => o.id)).toEqual(["r1"]);
  });

  it("an undo queued behind a rebake that fails does nothing", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    const rotating = s().rotateCanvas(90);
    await flush();
    const undone = undoEditor();
    raster.release();
    await expect(rotating).rejects.toThrow();
    await undone;
    // The step it meant to undo never landed, so the shape drawn before the rotate stays.
    expect(s().objects.map((o) => o.id)).toEqual(["r1"]);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
  });

  it("an undo queued behind a rebake that gets dropped does nothing", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    await flush();
    const undone = undoEditor();
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await Promise.all([rotating, undone]);
    // It must not take away the image the user just opened.
    expect(s().sourceImageUrl).toBe("blob:other");
  });

  it("an undo in a newly loaded document works immediately even while the old document's rotate is still decoding", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    await flush();
    s().loadImage("blob:other", 640, 480);
    s().addObject({ ...rect(), id: "on-new" });
    await undoEditor();
    expect(s().sourceImageUrl).toBe("blob:other");
    expect(s().objects).toEqual([]);
    raster.release();
    await expect(rotating).resolves.toBe(false);
  });

  it("a redo or rebake queued after a queued undo still runs (#2116)", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    await flush();
    const undone = undoEditor();
    const redone = redoEditor();
    raster.release();
    await Promise.all([rotating, undone, redone]);
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
  });

  // zundo's undo(0), and a negative or fractional count, replace the whole store with
  // undefined.
  it.each([0, -1, 1.5, Number.NaN])("ignores an undo or redo of %s steps", async (steps) => {
    await undoEditor(steps);
    await redoEditor(steps);
    expect(s().objects.map((o) => o.id)).toEqual(["r1"]);
    expect(s().sourceImageUrl).toBe("blob:test");
  });
});

describe("a history-panel jump", () => {
  it("lands on the clicked state even though a rebake committed first", async () => {
    const raster = stubRaster({ manual: true });
    // The row for "Load image": the state before the shape was added.
    const target = useEditorStore.temporal.getState().pastStates.at(-1);
    const rotating = s().rotateCanvas(90);
    await flush();
    const jumped = jumpEditorToHistoryState(target);
    raster.release();
    await Promise.all([rotating, jumped]);

    // Two steps back from where the rotate left things, not one: a count taken at
    // click time would have stopped on the shape.
    expect(s().objects).toEqual([]);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("blob:test");
  });

  it("still runs when the rebake ahead of it fails", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    const target = useEditorStore.temporal.getState().pastStates.at(-1);
    const rotating = s().rotateCanvas(90);
    await flush();
    const jumped = jumpEditorToHistoryState(target);
    raster.release();
    await expect(rotating).rejects.toThrow();
    await jumped;
    // It names a state, not "the rotate", so a failed rotate doesn't cancel it.
    expect(s().objects).toEqual([]);
  });

  it("rejects when the step no longer exists", async () => {
    await expect(jumpEditorToHistoryState({})).rejects.toThrow(/no longer exists/);
  });

  it("is dropped if another image was loaded before the queued jump ran", async () => {
    const raster = stubRaster({ manual: true });
    const target = useEditorStore.temporal.getState().pastStates.at(-1);
    const rotating = s().rotateCanvas(90);
    await flush();
    const jumped = jumpEditorToHistoryState(target);
    s().loadImage("blob:other", 640, 480);
    raster.release();
    await Promise.all([rotating, jumped]);
    expect(s().sourceImageUrl).toBe("blob:other");
  });
});

describe("a crop queued behind another rebake", () => {
  it("is dropped: its box was drawn on the canvas as it was before", async () => {
    const raster = stubRaster({ manual: true });
    const rotating = s().rotateCanvas(90);
    s().setCropState(CROP);
    const cropping = s().applyCrop();
    raster.release();
    await Promise.all([rotating, cropping]);

    // The rotate landed; the crop did not cut a region nobody framed.
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
    // The box stays up for the user to redraw.
    expect(s().cropState).toEqual(CROP);
  });

  it("is dropped if the box was redrawn while waiting for an earlier rebake that failed", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    const rotating = s().rotateCanvas(90);
    s().setCropState(CROP);
    const cropping = s().applyCrop();
    await flush();
    const redrawn = { ...CROP, width: 200 };
    s().setCropState(redrawn);
    raster.release();
    await expect(rotating).rejects.toThrow();
    await expect(cropping).resolves.toBe(false);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().cropState).toEqual(redrawn);
  });
});

describe("a crop with no area", () => {
  it("rejects and says why, instead of calling it too large to draw", async () => {
    stubRaster();
    s().setCropState({ x: 0, y: 0, width: 0, height: 0, aspectRatio: null });
    await expect(s().applyCrop()).rejects.toThrow(/no pixels/);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
  });
});

describe("rebakes run one at a time", () => {
  it("two quick rotations compose: the second starts from the first's result", async () => {
    const raster = stubRaster();
    const first = s().rotateCanvas(90);
    const second = s().rotateCanvas(90);
    await Promise.all([first, second]);

    // The second decode loaded what the first one produced, at the rotated size.
    expect(raster.sources).toEqual(["blob:test", "data:image/png;base64,REBAKED1"]);
    expect(raster.draws[1].args).toEqual([0, 0, 600, 800]);
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED2");
  });

  it("a rotation right after a canvas resize sees the resized canvas", async () => {
    stubRaster();
    const resize = s().resizeCanvas(1000, 800, "center");
    const rotate = s().rotateCanvas(90);
    await Promise.all([resize, rotate]);
    expect(s().canvasSize).toEqual({ width: 800, height: 1000 });
  });

  it("Image Size while a rotate is decoding waits for the rotate instead of cancelling it (#2116)", async () => {
    const raster = stubRaster({ manual: true });
    const rotate = s().rotateCanvas(90);
    await flush();
    const resize = s().resizeImage(300, 400);
    raster.release();
    await expect(Promise.all([rotate, resize])).resolves.toEqual([true, true]);

    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s().canvasSize).toEqual({ width: 300, height: 400 });
    // After 90 CW (800x600 -> 600x800), rect at (10,20,100x50) is at (530,10,50x100);
    // scaling 600x800 -> 300x400 halves it to (265,5,25x50).
    expect(s().objects[0].attrs).toMatchObject({ x: 265, y: 5, width: 25, height: 50 });
  });

  it("Image Size with unchanged dimensions while a rotate is decoding still lets the rotate land (#2116)", async () => {
    const raster = stubRaster({ manual: true });
    const rotate = s().rotateCanvas(90);
    await flush();
    const resize = s().resizeImage(800, 600);
    raster.release();
    await expect(Promise.all([rotate, resize])).resolves.toEqual([true, true]);

    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED1");
    expect(s().canvasSize).toEqual({ width: 800, height: 600 });
  });

  it("Trim while a rotate is decoding waits for the rotate and trims the rotated canvas (#2116)", async () => {
    const raster = stubRaster({ manual: true });
    const rotate = s().rotateCanvas(90);
    await flush();
    const trim = s().trimCanvas();
    raster.release();
    await flush();
    raster.release();
    await expect(Promise.all([rotate, trim])).resolves.toEqual([true, true]);

    expect(raster.sources).toEqual(["blob:test", "data:image/png;base64,REBAKED1"]);
    // After 90 CW, rect (10,20,100x50, sw=1) sits at (530,10,50x100) on 600x800;
    // trim bounds are x=529..581 (width 52), y=9..111 (height 102).
    expect(s().canvasSize).toEqual({ width: 52, height: 102 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED2");
    expect(raster.draws[1].args).toEqual([-529, -9, 600, 800]);
  });

  it("a rotate queued behind a trim rotates the trimmed canvas and bitmap (#2116)", async () => {
    const raster = stubRaster();
    const trim = s().trimCanvas();
    const rotate = s().rotateCanvas(90);
    await expect(Promise.all([trim, rotate])).resolves.toEqual([true, true]);

    expect(raster.sources).toEqual(["blob:test", "data:image/png;base64,REBAKED1"]);
    // Trim produces 102x52; rotating 90 CW swaps to 52x102.
    expect(s().canvasSize).toEqual({ width: 52, height: 102 });
    expect(s().sourceImageUrl).toBe("data:image/png;base64,REBAKED2");
    expect(raster.draws[1].args).toEqual([0, 0, 102, 52]);
  });

  it("gives up on an image that never loads, so it can't block every later rebake", async () => {
    vi.useFakeTimers();
    try {
      stubRaster({ manual: true });
      const stuck = s().rotateCanvas(90);
      const outcome = expect(stuck).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(30_000);
      await outcome;
      expect(s().canvasSize).toEqual({ width: 800, height: 600 });
    } finally {
      vi.useRealTimers();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    stubRaster();
    await s().rotateCanvas(90);
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
  });

  it("a failed rebake does not block the next one", async () => {
    stubRaster({ loadFails: true });
    const failed = s().rotateCanvas(90);
    await expect(failed).rejects.toThrow();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    stubRaster();
    await s().rotateCanvas(90);
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
  });
});

describe("with no source image there is no bitmap to rebuild", () => {
  it("commits straight away without touching a canvas", () => {
    const raster = stubRaster();
    useEditorStore.setState({ sourceImageUrl: null });
    const pending = s().rotateCanvas(90);
    // Synchronous: nothing to wait for.
    expect(s().canvasSize).toEqual({ width: 600, height: 800 });
    expect(raster.draws).toHaveLength(0);
    return pending;
  });

  it("trim commits straight away without touching a canvas", async () => {
    const raster = stubRaster();
    useEditorStore.setState({ sourceImageUrl: null });
    const pending = s().trimCanvas();
    expect(s().canvasSize).toEqual({ width: 102, height: 52 });
    expect(raster.draws).toHaveLength(0);
    await expect(pending).resolves.toBe(true);
  });

  it("trim resolves to false without decoding when there is nothing to trim", async () => {
    const raster = stubRaster();
    useEditorStore.setState({ objects: [] });
    await expect(s().trimCanvas()).resolves.toBe(false);

    s().addObject({
      ...rect(),
      attrs: { ...rect().attrs, x: 0, y: 0, width: 800, height: 600, strokeWidth: 0 },
    } as CanvasObject);
    await expect(s().trimCanvas()).resolves.toBe(false);

    useEditorStore.setState({
      objects: [
        {
          ...rect(),
          attrs: { ...rect().attrs, x: 900, y: 700, width: 10, height: 10, strokeWidth: 0 },
        } as CanvasObject,
      ],
    });
    await expect(s().trimCanvas()).resolves.toBe(false);
    expect(raster.draws).toHaveLength(0);
  });
});

describe("rebaking flag and cancellation on document replacement (#2115)", () => {
  it("sets rebaking while a decode is in flight and clears it when the queue drains", async () => {
    const raster = stubRaster({ manual: true });
    expect(s().rebaking).toBe(false);

    const first = s().rotateCanvas(90);
    expect(s().rebaking).toBe(true);

    const second = s().flipCanvasHorizontal();
    expect(s().rebaking).toBe(true);

    await flush();
    raster.release();
    await expect(first).resolves.toBe(true);
    // Second decode is now in flight, so rebaking stays true.
    expect(s().rebaking).toBe(true);

    await flush();
    raster.release();
    await expect(second).resolves.toBe(true);
    expect(s().rebaking).toBe(false);
  });

  it("clears rebaking when a rebake rejects", async () => {
    const raster = stubRaster({ manual: true, loadFails: true });
    const pending = s().rotateCanvas(90);
    expect(s().rebaking).toBe(true);

    await flush();
    raster.release();
    await expect(pending).rejects.toThrow();
    expect(s().rebaking).toBe(false);
  });

  it("resets rebaking immediately when the image is replaced or closed", async () => {
    const raster = stubRaster({ manual: true });
    const pending = s().rotateCanvas(90);
    expect(s().rebaking).toBe(true);

    s().loadImage("blob:other", 640, 480);
    expect(s().rebaking).toBe(false);

    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().rebaking).toBe(false);
  });

  it("cancels a hung decode immediately when another image is loaded, and a rotate on the new image runs without waiting", async () => {
    vi.useFakeTimers();
    try {
      const raster = stubRaster({ manual: true });
      const hungRotate = s().rotateCanvas(90);
      expect(s().rebaking).toBe(true);

      s().loadImage("blob:other", 640, 480);
      expect(s().rebaking).toBe(false);
      // Resolves to false immediately without advancing the 30s timer.
      await expect(hungRotate).resolves.toBe(false);

      // A rotate on the new image starts immediately, keeps rebaking true while decoding,
      // and commits without waiting for the old decode's 30s timeout.
      const nextRotate = s().rotateCanvas(90);
      expect(s().rebaking).toBe(true);
      expect(raster.sources).toEqual(["blob:test", "blob:other"]);
      raster.release();
      await expect(nextRotate).resolves.toBe(true);
      expect(s().canvasSize).toEqual({ width: 480, height: 640 });
      expect(s().rebaking).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(ACTIONS)(
    "%s: ends quietly without rejecting when cancelled by replacing the image",
    async (_name, run) => {
      stubRaster({ manual: true });
      const pending = run();
      expect(s().rebaking).toBe(true);
      await flush();

      s().loadImage("blob:other", 640, 480);
      expect(s().rebaking).toBe(false);

      await expect(pending).resolves.toBe(false);
      expect(s().sourceImageUrl).toBe("blob:other");
      expect(s().canvasSize).toEqual({ width: 640, height: 480 });
    },
  );

  it("does not log or toast when a rebake is cancelled by File > Close or cancelPendingRebakes", async () => {
    stubRaster({ manual: true });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = s().rotateCanvas(90);
    runEditorAction(pending, "Something went wrong");
    await flush();

    cancelPendingRebakes();
    expect(s().rebaking).toBe(false);

    await expect(pending).resolves.toBe(false);
    await flush();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it("crop: cancelling an in-flight hung crop aborts the decode and clears rebaking immediately", async () => {
    vi.useFakeTimers();
    try {
      stubRaster({ manual: true });
      s().setCropState(CROP);
      const pending = s().applyCrop();
      expect(s().rebaking).toBe(true);

      s().setCropState(null);
      await expect(pending).resolves.toBe(false);
      expect(s().cropState).toBeNull();
      expect(s().rebaking).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("crop: ends quietly when the decode fails after the crop box was redrawn", async () => {
    const raster = stubRaster({ manual: true, toDataURLThrows: true });
    s().setCropState(CROP);
    const pending = s().applyCrop();
    await flush();

    const redrawn = { ...CROP, width: 200 };
    s().setCropState(redrawn);
    raster.release();
    await expect(pending).resolves.toBe(false);
    expect(s().cropState).toEqual(redrawn);
    expect(s().cropApplying).toBe(false);
    expect(s().rebaking).toBe(false);
  });
});
