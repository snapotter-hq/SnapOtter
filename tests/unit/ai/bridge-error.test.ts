import { describe, expect, it } from "vitest";
import { extractPythonErrorInfo } from "../../../packages/ai/src/bridge.js";

describe("extractPythonErrorInfo", () => {
  it("reads the structured envelope from stdout JSON", () => {
    const stdout = JSON.stringify({
      success: false,
      error: "CUDA out of memory for <path>",
      errorInfo: {
        type: "RuntimeError",
        frames: [{ file: "remove_bg.py", line: 88, func: "run" }],
      },
    });
    const info = extractPythonErrorInfo({ stdout, stderr: "" });
    expect(info).toEqual({
      type: "RuntimeError",
      frames: [{ file: "remove_bg.py", line: 88, func: "run" }],
    });
  });

  it("returns null when there is no envelope (back-compat)", () => {
    expect(extractPythonErrorInfo({ stdout: "boom", stderr: "" })).toBeNull();
  });

  it("parses a real dispatcher envelope verbatim", () => {
    // Shape captured from an actual dispatcher._run_script_main failure.
    const stdout =
      '{"success": false, "error": "model load failed at <path> for <ip>", "errorInfo": {"type": "RuntimeError", "message": "model load failed at <path> for <ip>", "frames": [{"file": "remove_bg.py", "line": 42, "func": "run"}, {"file": "remove_bg.py", "line": 18, "func": "_load"}]}}';
    const info = extractPythonErrorInfo({ stdout, stderr: "" });
    expect(info?.type).toBe("RuntimeError");
    expect(info?.frames).toEqual([
      { file: "remove_bg.py", line: 42, func: "run" },
      { file: "remove_bg.py", line: 18, func: "_load" },
    ]);
  });

  it("extracts errorInfo from trailing JSON line when diagnostic lines precede it on stderr (issue #3107)", () => {
    const stderr = [
      "[install] rolled the venv back to its state before this bundle",
      JSON.stringify({
        error: "Custom sidecar error",
        errorInfo: {
          type: "RuntimeError",
          frames: [{ file: "install_feature.py", line: 64, func: "fail" }],
        },
      }),
    ].join("\n");
    const info = extractPythonErrorInfo({ stdout: "", stderr });
    expect(info).toEqual({
      type: "RuntimeError",
      frames: [{ file: "install_feature.py", line: 64, func: "fail" }],
    });
  });

  it("skips non-envelope JSON lines in reverse when reading errorInfo (issue #3107)", () => {
    const stderr = [
      "[install] starting rollback",
      JSON.stringify({
        error: "Bundle checksum mismatch",
        errorInfo: {
          type: "ValueError",
          frames: [{ file: "install_feature.py", line: 120, func: "verify" }],
        },
      }),
      '{"status": "cleanup_done"}',
      "{malformed json",
    ].join("\n");
    const info = extractPythonErrorInfo({ stdout: "progress output", stderr });
    expect(info).toEqual({
      type: "ValueError",
      frames: [{ file: "install_feature.py", line: 120, func: "verify" }],
    });
  });
});
