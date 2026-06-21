import { afterEach, describe, expect, it } from "vitest";
import { usePipelineStore } from "../../../apps/web/src/stores/pipeline-store";

describe("usePipelineStore", () => {
  afterEach(() => {
    usePipelineStore.getState().reset();
  });

  it("starts with empty steps", () => {
    expect(usePipelineStore.getState().steps).toEqual([]);
  });

  it("addStep appends a step with generated id", () => {
    usePipelineStore.getState().addStep("resize");
    const steps = usePipelineStore.getState().steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].toolId).toBe("resize");
    expect(steps[0].settings).toEqual({});
    expect(steps[0].id).toBeTruthy();
  });

  it("addStep auto-expands the new step", () => {
    usePipelineStore.getState().addStep("resize");
    const { steps, expandedStepId } = usePipelineStore.getState();
    expect(expandedStepId).toBe(steps[0].id);
  });

  it("removeStep removes by id", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    const id = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().removeStep(id);
    expect(usePipelineStore.getState().steps).toHaveLength(1);
    expect(usePipelineStore.getState().steps[0].toolId).toBe("compress");
  });

  it("removeStep clears expandedStepId if removing expanded step", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    expect(usePipelineStore.getState().expandedStepId).toBe(id);
    usePipelineStore.getState().removeStep(id);
    expect(usePipelineStore.getState().expandedStepId).toBeNull();
  });

  it("reorderSteps swaps two step positions", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().addStep("compress");
    usePipelineStore.getState().addStep("convert");
    const steps = usePipelineStore.getState().steps;
    usePipelineStore.getState().reorderSteps(steps[0].id, steps[2].id);
    const reordered = usePipelineStore.getState().steps;
    expect(reordered.map((s) => s.toolId)).toEqual(["compress", "convert", "resize"]);
  });

  it("updateStepSettings merges settings for the target step", () => {
    usePipelineStore.getState().addStep("resize");
    const id = usePipelineStore.getState().steps[0].id;
    usePipelineStore.getState().updateStepSettings(id, { width: 800, height: 600 });
    expect(usePipelineStore.getState().steps[0].settings).toEqual({ width: 800, height: 600 });
  });

  it("loadSteps replaces all steps and generates new ids", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().loadSteps([
      { toolId: "compress", settings: { quality: 80 } },
      { toolId: "convert", settings: { format: "webp" } },
    ]);
    const steps = usePipelineStore.getState().steps;
    expect(steps).toHaveLength(2);
    expect(steps[0].toolId).toBe("compress");
    expect(steps[0].settings).toEqual({ quality: 80 });
    expect(steps[1].toolId).toBe("convert");
  });

  it("reset clears all state", () => {
    usePipelineStore.getState().addStep("resize");
    usePipelineStore.getState().reset();
    expect(usePipelineStore.getState().steps).toEqual([]);
    expect(usePipelineStore.getState().expandedStepId).toBeNull();
  });
});
