import { spawnSync } from "node:child_process";
import { SafeError } from "@snapotter/shared";
import { resolveFfmpeg } from "./binaries.js";

export type EncoderTarget =
  | "h264"
  | "hevc"
  | "av1"
  | "vp9"
  | "aac"
  | "opus"
  | "mp3"
  | "vorbis"
  | "theora"
  | "webp";

/**
 * Every encoder that comes from an external library, so a custom ffmpeg can
 * be built without it. Tools go through resolveEncoder (or softwareEncoder)
 * rather than naming these, which is what lets a missing one fail with a
 * clear message instead of "Unknown encoder" (#1270).
 */
const SOFTWARE: Record<EncoderTarget, string> = {
  h264: "libx264",
  hevc: "libx265",
  av1: "libsvtav1",
  vp9: "libvpx-vp9",
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
  vorbis: "libvorbis",
  theora: "libtheora",
  webp: "libwebp_anim",
};

const NVENC: Partial<Record<EncoderTarget, string>> = {
  h264: "h264_nvenc",
  hevc: "hevc_nvenc",
  av1: "av1_nvenc",
};

const VAAPI: Partial<Record<EncoderTarget, string>> = {
  h264: "h264_vaapi",
  hevc: "hevc_vaapi",
};

const FAMILIES: Record<string, Partial<Record<EncoderTarget, string>>> = {
  nvenc: NVENC,
  vaapi: VAAPI,
};

/** The values SNAPOTTER_HW_ACCEL accepts. Single source for docs and logs. */
export const HW_ACCEL_FAMILIES = Object.keys(FAMILIES);

const ALL_TARGETS: EncoderTarget[] = [
  "h264",
  "hevc",
  "av1",
  "vp9",
  "aac",
  "opus",
  "mp3",
  "vorbis",
  "theora",
  "webp",
];

/**
 * The configured family map, or undefined.
 *
 * `Object.hasOwn` rather than a bare index: FAMILIES is an object literal, so
 * `FAMILIES["constructor"]` and `FAMILIES["__proto__"]` are truthy inherited
 * values. Without the guard, SNAPOTTER_HW_ACCEL=constructor reports as a
 * recognised family and the admin gets told their ffmpeg is deficient rather
 * than that they have a typo.
 */
function requestedFamily(): {
  name: string | null;
  map: Partial<Record<EncoderTarget, string>> | undefined;
} {
  const accel = (process.env.SNAPOTTER_HW_ACCEL ?? "").toLowerCase();
  if (!accel) return { name: null, map: undefined };
  return { name: accel, map: Object.hasOwn(FAMILIES, accel) ? FAMILIES[accel] : undefined };
}

/**
 * A row of the `ffmpeg -encoders` table: one leading space, six flag columns,
 * then the encoder name.
 *
 *     V....D libx264              libx264 H.264 / AVC ...
 *
 * The legend printed above the table has the same flag shape:
 *
 *     V..... = Video
 *
 * so matching on flags alone records "=" as an encoder. Requiring the name to
 * start alphanumeric rejects the legend without depending on the ` ------ `
 * separator, which is not guaranteed across builds.
 *
 * Fails safe: a future ffmpeg that adds a seventh flag column matches nothing,
 * which reads as "inventory unavailable" and sends callers to software.
 */
const ENCODER_ROW = /^\s[VAS][.A-Z]{5}\s+([A-Za-z0-9][\w.-]*)\s/;

const PROBE_TIMEOUT_MS = 10_000;
const PROBE_MAX_BUFFER = 4 * 1024 * 1024;

/** Encoder names listed by `ffmpeg -encoders`. */
export function parseEncoderNames(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split("\n")) {
    const match = ENCODER_ROW.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

interface Probe {
  /**
   * Null when the list could not be read. The hardware gate treats that as
   * "absent"; the software check treats it as "unknown" and fails open.
   */
  names: ReadonlySet<string> | null;
  /** Why it could not be read. Null on success. */
  error: string | null;
}

let probe: Probe | undefined;

function runProbe(): Probe {
  const bin = resolveFfmpeg();
  if (!bin) return { names: null, error: "no ffmpeg binary found (set FFMPEG_PATH)" };

  const res = spawnSync(bin, ["-hide_banner", "-encoders"], {
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: PROBE_MAX_BUFFER,
  });
  // Distinguish the failure modes: a missing path, a non-executable binary, a
  // timeout and a crash all need different fixes from the admin, and a bare
  // "could not read" sends them looking in the wrong place.
  if (res.error) return { names: null, error: `${bin}: ${res.error.message}` };
  if (res.status !== 0) {
    const detail = (res.stderr ?? "").trim().slice(-200);
    const how = res.status === null ? `signal ${res.signal ?? "unknown"}` : `code ${res.status}`;
    return { names: null, error: `${bin} -encoders exited ${how}${detail ? `: ${detail}` : ""}` };
  }
  const names = parseEncoderNames(res.stdout ?? "");
  return names.size > 0
    ? { names, error: null }
    : { names: null, error: `${bin} -encoders printed no recognisable encoder rows` };
}

/**
 * Cached for the process. A failed probe is cached too: retrying a 10s
 * blocking spawn on every call would turn a slow boot into a slow every-job.
 * The cost is that a transient failure pins the process to software, and
 * switches off the software-encoder check, until it restarts. The startup log
 * reports it either way.
 */
function encoderProbe(): Probe {
  if (probe === undefined) probe = runProbe();
  return probe;
}

/** Pin the inventory instead of probing. `undefined` restores real probing. */
export function setEncoderInventoryForTests(names: ReadonlySet<string> | null | undefined): void {
  probe = names === undefined ? undefined : { names, error: names ? null : "pinned by test" };
}

/**
 * Hardware-acceleration seam (spec 4.5): SNAPOTTER_HW_ACCEL selects an encoder
 * family. Unknown values, and families this ffmpeg build cannot actually run,
 * fall back to software.
 *
 * The availability check is not belt-and-braces. The published image's static
 * ffmpeg ships QSV and v4l2m2m only, with no NVENC or VAAPI on either arch or
 * inside the CUDA image, so a documented `SNAPOTTER_HW_ACCEL=nvenc` used to
 * resolve to `h264_nvenc` and kill every re-encoding job with
 * `Unknown encoder 'h264_nvenc'` (#1054).
 *
 * Throws when the software encoder it would fall back to is not listed by
 * this build either (#1092); see requireSoftware.
 */
export function resolveEncoder(target: EncoderTarget): string {
  const hardware = requestedFamily().map?.[target];
  const { names } = encoderProbe();
  if (hardware && names?.has(hardware)) return hardware;
  return requireSoftware(target, names);
}

/**
 * The software encoder for `target`, checked against the build but never
 * swapped for hardware. For command lines whose options only the software
 * encoder accepts, such as libx264's `-preset ultrafast`, which NVENC rejects.
 */
export function softwareEncoder(target: EncoderTarget): string {
  return requireSoftware(target, encoderProbe().names);
}

/**
 * The software encoder for `target`, checked against the build (#1092). A
 * custom FFMPEG_PATH built without, say, libx264 otherwise dies at encode
 * time with ffmpeg's `Unknown encoder`, which friendlyError collapses into
 * "the file may be corrupted" and so blames the user's file.
 *
 * Fails open when the inventory could not be read: an unreadable probe says
 * nothing about the build, and failing closed would turn it into every media
 * job failing. The message stays short, single-line and path-free so
 * friendlyError passes it to the client verbatim. Operational, because the
 * cause is the host's ffmpeg, not a SnapOtter bug: error reporting then
 * treats it as an environment fault rather than paging on every job.
 */
function requireSoftware(target: EncoderTarget, names: ReadonlySet<string> | null): string {
  const software = SOFTWARE[target];
  if (!names || names.has(software)) return software;
  throw new SafeError(
    `This server's ffmpeg build has no ${software} encoder, which ${target} output needs. ` +
      "An administrator needs to install a full ffmpeg build or change FFMPEG_PATH.",
    { kind: "operational", code: "ENCODER_MISSING" },
  );
}

export interface SoftwareEncoderStatus {
  /** Software encoders this build does not list, in target order. */
  missing: string[];
  /** Why the encoder list could not be read. Null when it read fine. */
  probeError: string | null;
}

/**
 * Which software encoders the build lacks, for the startup log, so an admin
 * running a lean custom ffmpeg learns it at boot rather than from the first
 * failed job. Empty when the probe failed: `probeError` says why instead.
 */
export function softwareEncoderStatus(): SoftwareEncoderStatus {
  const { names, error } = encoderProbe();
  if (!names) return { missing: [], probeError: error };
  const missing = ALL_TARGETS.map((t) => SOFTWARE[t]).filter((name) => !names.has(name));
  return { missing, probeError: null };
}

export interface HwAccelStatus {
  /** The configured family, lowercased. Null when unset or empty. */
  requested: string | null;
  /** Whether `requested` names a family this seam knows about. */
  recognized: boolean;
  /** Hardware encoders this build lists, so they will be used. */
  active: string[];
  /** Hardware encoders this family maps to that the build does not list. */
  missing: string[];
  /** Targets the family has no hardware encoder for; they stay on software. */
  unmapped: EncoderTarget[];
  /**
   * Why the encoder list could not be read, when a probe was attempted. Null
   * when it read fine, and when no probe was needed.
   */
  probeError: string | null;
}

/**
 * What the current SNAPOTTER_HW_ACCEL setting will actually do. Callers log
 * this at startup so an admin who sets a family this build cannot run learns
 * it from the boot log rather than from unchanged encode times.
 *
 * "Active" means the build lists the encoder, which is not the same as being
 * able to run it: a general-purpose ffmpeg lists h264_nvenc whether or not an
 * NVIDIA device is present. Word any message accordingly.
 */
export function hwAccelStatus(): HwAccelStatus {
  const { name, map } = requestedFamily();
  if (!map) {
    return {
      requested: name,
      recognized: false,
      active: [],
      missing: [],
      unmapped: [],
      probeError: null,
    };
  }

  const { names, error } = encoderProbe();
  const active: string[] = [];
  const missing: string[] = [];
  for (const target of ALL_TARGETS) {
    const hardware = map[target];
    if (!hardware) continue;
    if (names?.has(hardware)) active.push(hardware);
    else missing.push(hardware);
  }
  return {
    requested: name,
    recognized: true,
    active,
    missing,
    unmapped: ALL_TARGETS.filter((t) => !map[t]),
    probeError: error,
  };
}
