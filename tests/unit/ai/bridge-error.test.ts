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
});
