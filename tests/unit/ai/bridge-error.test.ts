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
});
