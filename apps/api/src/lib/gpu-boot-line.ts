/**
 * One boot-banner line describing the AI acceleration state.
 *
 * The AI sidecar starts on the first AI request, so the banner can only report
 * the hardware, not whether CUDA frameworks are usable. A fresh GPU deployment
 * has working passthrough but no torch/ONNX runtime until the first AI bundle
 * installs, so the line must not claim CUDA is in use (#673).
 */
export function gpuBootLine(gpuHardwarePresent: boolean): string {
  if (gpuHardwarePresent) {
    return "[INFO] GPU hardware detected -- the AI sidecar starts on the first AI tool request and uses CUDA once its frameworks are installed";
  }
  return "[WARN] No GPU detected -- AI tools will use CPU (slower)";
}
