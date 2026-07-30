import { describe, expect, it } from "vitest";
import { gpuBootLine } from "../../../apps/api/src/lib/gpu-boot-line.js";

describe("gpuBootLine", () => {
  it("announces CUDA when the dispatcher can use the GPU", () => {
    expect(gpuBootLine({ ready: true, gpu: true }, true)).toBe(
      "[INFO] GPU detected -- AI tools will use CUDA acceleration",
    );
  });

  it("explains the pending-bundle state instead of claiming no GPU exists", () => {
    // Fresh GPU deployment: passthrough works, but no torch/ONNX runtime is
    // installed until the first AI bundle, so the dispatcher reports gpu=false.
    const line = gpuBootLine({ ready: true, gpu: false }, true);
    expect(line).toContain("GPU hardware detected");
    expect(line).toContain("AI bundle");
    expect(line).not.toContain("No GPU detected");
  });

  it("keeps the plain no-GPU warning for hosts without a GPU", () => {
    expect(gpuBootLine({ ready: true, gpu: false }, false)).toBe(
      "[WARN] No GPU detected -- AI tools will use CPU (slower)",
    );
  });

  it("keeps the sidecar warning when the dispatcher did not start", () => {
    expect(gpuBootLine({ ready: false, gpu: false }, true)).toBe(
      "[WARN] AI sidecar did not start -- AI tools will use per-request Python (slower)",
    );
  });
});
