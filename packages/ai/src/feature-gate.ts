import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Python script name -> required feature bundle.
 *
 * This MUST mirror TOOL_BUNDLE_MAP in packages/ai/python/dispatcher.py. The
 * persistent dispatcher enforces this gate in Python; the per-request fallback
 * path (PythonDispatcher.runPerRequest) spawns scripts directly and would
 * otherwise bypass it, so it enforces the same gate here. A drift test keeps
 * the two maps in sync (tests/unit/ai/feature-gate.test.ts).
 */
export const SCRIPT_BUNDLE_MAP: Record<string, string> = {
  remove_bg: "background-removal",
  gif_remove_bg: "background-removal",
  detect_faces: "face-detection",
  face_landmarks: "face-detection",
  red_eye_removal: "face-detection",
  inpaint: "object-eraser-colorize",
  outpaint: "object-eraser-colorize",
  colorize: "object-eraser-colorize",
  upscale: "upscale-enhance",
  enhance_faces: "upscale-enhance",
  noise_removal: "upscale-enhance",
  restore: "photo-restoration",
  ocr: "ocr",
  ocr_pdf: "ocr",
  transcribe: "transcription",
};

/** Bundle ids currently recorded as installed in DATA_DIR/ai/installed.json. */
function installedBundles(): Set<string> {
  // Resolve DATA_DIR the same way the API config does for native checkouts.
  // Docker images set DATA_DIR=/data explicitly.
  const installedPath = join(process.env.DATA_DIR || "./data", "ai", "installed.json");
  try {
    const data = JSON.parse(readFileSync(installedPath, "utf-8")) as {
      bundles?: Record<string, unknown>;
    };
    return new Set(Object.keys(data.bundles ?? {}));
  } catch {
    // Fail closed, exactly like dispatcher._get_installed_bundles(): a missing
    // or unreadable installed.json reads as "nothing installed".
    return new Set();
  }
}

/**
 * The feature bundle a script requires if that bundle is NOT installed, else
 * null. Returns null for ungated scripts (e.g. doc-profile scripts) and for
 * gated scripts whose bundle is installed. Mirrors the dispatcher's gate so the
 * fallback path behaves identically whether or not the dispatcher is running.
 *
 * Accepts the script name with or without a ".py" suffix.
 */
export function missingBundleForScript(scriptName: string): string | null {
  const bundle = SCRIPT_BUNDLE_MAP[scriptName.replace(/\.py$/, "")];
  if (!bundle) return null;
  return installedBundles().has(bundle) ? null : bundle;
}
