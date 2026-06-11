export type EncoderTarget = "h264" | "hevc" | "av1" | "vp9" | "aac" | "opus" | "mp3";

const SOFTWARE: Record<EncoderTarget, string> = {
  h264: "libx264",
  hevc: "libx265",
  av1: "libsvtav1",
  vp9: "libvpx-vp9",
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
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

/**
 * Hardware-acceleration seam (spec 4.5): SNAPOTTER_HW_ACCEL selects an
 * encoder family; a CUDA/NVENC deployment is a Dockerfile change, not a
 * code change. Unknown values fall back to software.
 */
export function resolveEncoder(target: EncoderTarget): string {
  const accel = (process.env.SNAPOTTER_HW_ACCEL ?? "").toLowerCase();
  if (accel === "nvenc") return NVENC[target] ?? SOFTWARE[target];
  if (accel === "vaapi") return VAAPI[target] ?? SOFTWARE[target];
  return SOFTWARE[target];
}
