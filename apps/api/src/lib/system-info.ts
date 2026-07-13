import { existsSync } from "node:fs";
import os from "node:os";
import type { InstanceStartedProperties } from "@snapotter/shared";
import { deployMode } from "./deploy-mode.js";

// Facts about the running instance, shipped once at boot as the
// `instance_started` analytics event. Returning the shared event-property type
// keeps this gatherer in lockstep with the event contract (single source of
// truth) rather than duplicating the shape here.
//
// The NVIDIA Container Toolkit exposes GPU device nodes when a GPU is passed
// through (docker run --gpus / compose deploy.resources.reservations), so a
// filesystem check is enough; no nvidia-smi spawn or AI dispatcher needed.
// This is deliberately independent of packages/ai's isGpuAvailable(), which
// only reflects hardware in use by an already-started dispatcher.
export function gatherSystemProperties(): InstanceStartedProperties {
  return {
    arch: process.arch === "arm64" ? "arm64" : "amd64",
    os_platform: os.platform(),
    deploy_mode: deployMode(),
    gpu_present: existsSync("/dev/nvidia0"),
  };
}
