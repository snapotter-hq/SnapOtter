interface DispatcherStartState {
  ready: boolean;
  gpu: boolean;
}

/**
 * One boot-banner line describing the AI acceleration state.
 *
 * The hardware-present-but-unusable branch exists because a fresh GPU
 * deployment has working passthrough but no torch/ONNX runtime until the
 * first AI bundle installs, so the dispatcher reports gpu=false. Logging
 * "No GPU detected" there sends GPU users off to debug their container
 * toolkit (#673).
 */
export function gpuBootLine(dispatcher: DispatcherStartState, gpuHardwarePresent: boolean): string {
  if (!dispatcher.ready) {
    return "[WARN] AI sidecar did not start -- AI tools will use per-request Python (slower)";
  }
  if (dispatcher.gpu) {
    return "[INFO] GPU detected -- AI tools will use CUDA acceleration";
  }
  if (gpuHardwarePresent) {
    return "[INFO] GPU hardware detected -- AI frameworks install with the first AI bundle; AI tools use CPU until then";
  }
  return "[WARN] No GPU detected -- AI tools will use CPU (slower)";
}
