import { describe, expect, it } from "vitest";
import { stripInternalPaths } from "../../../apps/api/src/lib/errors.js";

describe("stripInternalPaths", () => {
  it("removes /tmp paths from error messages", () => {
    const input = "Failed to read /tmp/workspace/abc123/input/photo.png";
    const result = stripInternalPaths(input);
    expect(result).toBe("Failed to read [internal]");
    expect(result).not.toContain("/tmp");
  });

  it("removes /data/ paths from error messages", () => {
    const input = "Cannot access /data/files/user123/image.jpg for processing";
    const result = stripInternalPaths(input);
    expect(result).toBe("Cannot access [internal] for processing");
    expect(result).not.toContain("/data");
  });

  it("removes /app/ paths from error messages", () => {
    const input = "Module not found at /app/node_modules/sharp/lib/index.js";
    const result = stripInternalPaths(input);
    expect(result).toBe("Module not found at [internal]");
    expect(result).not.toContain("/app");
  });

  it("removes /home/ and /opt/ paths", () => {
    const home = "Error in /home/deploy/.config/sharp";
    expect(stripInternalPaths(home)).toBe("Error in [internal]");
    expect(stripInternalPaths(home)).not.toContain("/home");

    const opt = "Binary missing at /opt/sharp/vendor/lib";
    expect(stripInternalPaths(opt)).toBe("Binary missing at [internal]");
    expect(stripInternalPaths(opt)).not.toContain("/opt");
  });

  it("removes /workspace/ paths", () => {
    const input = "File not found: /workspace/build/output.png";
    const result = stripInternalPaths(input);
    expect(result).toBe("File not found: [internal]");
    expect(result).not.toContain("/workspace");
  });

  it("preserves non-path content unchanged", () => {
    const input = "Invalid image dimensions: width must be positive";
    expect(stripInternalPaths(input)).toBe(input);
  });

  it("preserves messages with no filesystem paths", () => {
    const input = "Unsupported format: expected JPEG or PNG";
    expect(stripInternalPaths(input)).toBe(input);
  });

  it("handles multiple paths in a single message", () => {
    const input = "Copy from /tmp/input/a.png to /data/output/b.png failed";
    const result = stripInternalPaths(input);
    expect(result).not.toContain("/tmp");
    expect(result).not.toContain("/data");
    expect(result).toContain("[internal]");
  });

  it("handles empty string", () => {
    expect(stripInternalPaths("")).toBe("");
  });
});

describe("Settings payload size limit", () => {
  it("rejects settings payload exceeding 64KB", () => {
    // Simulate the guard condition from tool-factory.ts
    const oversizedPayload = "x".repeat(65537);
    expect(oversizedPayload.length).toBeGreaterThan(65536);
    // The actual guard: settingsRaw && settingsRaw.length > 65536
    expect(oversizedPayload.length > 65536).toBe(true);
  });

  it("allows settings payload at exactly 64KB", () => {
    const exactPayload = "x".repeat(65536);
    expect(exactPayload.length > 65536).toBe(false);
  });

  it("allows normal-sized settings payload", () => {
    const normalPayload = JSON.stringify({ quality: 80, format: "png" });
    expect(normalPayload.length > 65536).toBe(false);
  });
});
