import { describe, expect, it } from "vitest";
import { gpuBootLine } from "../../../apps/api/src/lib/gpu-boot-line.js";

describe("gpuBootLine", () => {
  it("reports the hardware without claiming CUDA is in use", () => {
    // Fresh GPU deployment: passthrough works, but no torch/ONNX runtime is
    // installed until the first AI bundle, and the sidecar has not started.
    const line = gpuBootLine(true);
    expect(line).toContain("GPU hardware detected");
    expect(line).toContain("first AI tool request");
    expect(line).not.toContain("No GPU detected");
    expect(line).not.toContain("will use CUDA acceleration");
  });

  it("keeps the plain no-GPU warning for hosts without a GPU", () => {
    expect(gpuBootLine(false)).toBe("[WARN] No GPU detected -- AI tools will use CPU (slower)");
  });
});
