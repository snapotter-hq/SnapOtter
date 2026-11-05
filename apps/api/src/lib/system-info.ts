import { existsSync } from "node:fs";
import os from "node:os";
import {
  APP_VERSION,
  type InstanceStartedProperties,
  nvidiaDeviceVisible,
} from "@snapotter/shared";
import { deployMode } from "./deploy-mode.js";

// Facts about the running instance, shipped once at boot as the
// `instance_started` analytics event. Returning the shared event-property type
// keeps this gatherer in lockstep with the event contract (single source of
// truth) rather than duplicating the shape here.
//
// GPU presence is a filesystem check (device nodes, or /dev/dxg plus an NVIDIA
// driver file under WSL2; see packages/shared/src/gpu-devices.ts), so it needs
// no nvidia-smi spawn or AI dispatcher. This is deliberately independent of
// packages/ai's isGpuAvailable(), which only reflects hardware in use by an
// already-started dispatcher.
export function gatherSystemProperties(): InstanceStartedProperties {
  return {
    arch: process.arch === "arm64" ? "arm64" : "amd64",
    os_platform: os.platform(),
    deploy_mode: deployMode(),
    gpu_present: nvidiaDeviceVisible(existsSync),
    app_version: APP_VERSION,
  };
}
