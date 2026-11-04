import { HW_ACCEL_FAMILIES, hwAccelStatus, softwareEncoderStatus } from "@snapotter/media-engine";
import {
  binaryOverrideWarning,
  checkBinaryOverrides,
  probeFailureLevel,
} from "../lib/binary-overrides.js";
import { logger } from "../lib/logger.js";

/**
 * Name every *_PATH override that does not point at an executable file, so
 * the admin learns it at boot rather than from a masked 500 on the first
 * upload (#1310). The resolvers return the override unchecked, so nothing
 * falls back: every job that needs the binary fails until it is fixed.
 */
export function logBinaryOverrides(): void {
  for (const problem of checkBinaryOverrides(process.env)) {
    logger.warn({ variable: problem.variable, path: problem.path }, binaryOverrideWarning(problem));
  }
}

/**
 * Name the software encoders a custom FFMPEG_PATH build lacks, so an admin
 * learns it at boot rather than from the first failed job (#1092). A failed
 * probe is info for the image's own binary: jobs fail open on it, so nothing
 * breaks, but the check is off for the life of the process and that should
 * leave a trace. With an explicit FFMPEG_PATH it is a misconfiguration and
 * goes out at warn, where production log filters still show it (#1310).
 */
export function logMissingSoftwareEncoders(): void {
  const { missing, probeError } = softwareEncoderStatus();
  if (probeError) {
    logger[probeFailureLevel(process.env.FFMPEG_PATH)](
      { probeError, ffmpegPath: process.env.FFMPEG_PATH },
      `Could not read the ffmpeg encoder list (${probeError}); software encoders will not be checked before use`,
    );
    return;
  }
  if (missing.length === 0) return;
  logger.warn(
    { missing },
    `This ffmpeg build lacks software encoders ${missing.join(", ")}; media tools that need them will fail until a full ffmpeg build is installed`,
  );
}

/**
 * Say what SNAPOTTER_HW_ACCEL actually does on this host. Without it a wrong
 * value is invisible: encoding silently stays on software and the only symptom
 * is that nothing got faster (#1054).
 *
 * `hwAccelStatus` trial-encodes a frame per listed hardware encoder (#1089),
 * so `active` only names encoders that actually ran on this host.
 */
export function logHwAccel(): void {
  const status = hwAccelStatus();
  if (!status.requested) return;

  const softwareNote =
    status.unmapped.length > 0 ? `; ${status.unmapped.join(", ")} always use software` : "";

  if (!status.recognized) {
    logger.warn(
      { requested: status.requested, supported: HW_ACCEL_FAMILIES },
      `SNAPOTTER_HW_ACCEL="${status.requested}" is not a recognised encoder family (${HW_ACCEL_FAMILIES.join(", ")}); using software encoders`,
    );
    return;
  }

  if (status.active.length === 0) {
    const why =
      status.probeError ??
      (status.unusable.length > 0
        ? `trial encode failed for ${status.unusable.join(", ")}`
        : "this ffmpeg build lists none of them");
    logger.warn(
      {
        requested: status.requested,
        missing: status.missing,
        unusable: status.unusable,
        probeError: status.probeError,
      },
      `SNAPOTTER_HW_ACCEL="${status.requested}" was requested but ${why}; using software encoders`,
    );
    return;
  }

  const fallback = [...status.missing, ...status.unusable];
  if (fallback.length > 0) {
    logger.warn(
      {
        requested: status.requested,
        active: status.active,
        missing: status.missing,
        unusable: status.unusable,
      },
      `SNAPOTTER_HW_ACCEL="${status.requested}" is partly available; ${fallback.join(", ")} fall back to software${softwareNote}`,
    );
    return;
  }

  logger.info(
    { requested: status.requested, active: status.active, unmapped: status.unmapped },
    `Hardware encoders enabled: ${status.active.join(", ")}${softwareNote}`,
  );
}
