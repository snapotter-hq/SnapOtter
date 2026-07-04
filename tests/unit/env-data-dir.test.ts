import { describe, expect, it } from "vitest";
import { loadEnv } from "../../apps/api/src/lib/env.js";

describe("env DATA_DIR", () => {
  it("defaults to ./data when unset", () => {
    const prev = process.env.DATA_DIR;
    delete process.env.DATA_DIR;
    try {
      expect(loadEnv().DATA_DIR).toBe("./data");
    } finally {
      if (prev !== undefined) process.env.DATA_DIR = prev;
    }
  });

  it("honors an explicit DATA_DIR", () => {
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = "/data";
    try {
      expect(loadEnv().DATA_DIR).toBe("/data");
    } finally {
      if (prev === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prev;
    }
  });
});
