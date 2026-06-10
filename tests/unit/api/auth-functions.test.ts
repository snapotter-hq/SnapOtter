import { describe, expect, it, vi } from "vitest";

vi.mock("../../../apps/api/src/db/index.js", () => ({
  db: {},
  pool: {},
  closeDb: async () => {},
  schema: {},
}));

import {
  computeKeyPrefix,
  hashPassword,
  verifyPassword,
} from "../../../apps/api/src/plugins/auth.js";

describe("hashPassword", () => {
  it("returns a string in salt:hash format", async () => {
    const result = await hashPassword("TestPass1");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });

  it("produces a 64-character hex salt (32 bytes)", async () => {
    const result = await hashPassword("TestPass1");
    const [salt] = result.split(":");
    expect(salt).toHaveLength(64);
    expect(salt).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces a 128-character hex hash (64 bytes)", async () => {
    const result = await hashPassword("TestPass1");
    const [, hash] = result.split(":");
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it("generates different salts on each call", async () => {
    const a = await hashPassword("TestPass1");
    const b = await hashPassword("TestPass1");
    const saltA = a.split(":")[0];
    const saltB = b.split(":")[0];
    expect(saltA).not.toBe(saltB);
  });

  it("produces a hash that can be verified back", async () => {
    const stored = await hashPassword("MySecret9");
    const ok = await verifyPassword("MySecret9", stored);
    expect(ok).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const stored = await hashPassword("Correct1");
    expect(await verifyPassword("Correct1", stored)).toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const stored = await hashPassword("Correct1");
    expect(await verifyPassword("Wrong1abc", stored)).toBe(false);
  });

  it("returns false for an empty stored string", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("returns false for a malformed stored string (no colon)", async () => {
    expect(await verifyPassword("anything", "nocolonhere")).toBe(false);
  });

  it("returns false for a truncated hash", async () => {
    const stored = await hashPassword("Correct1");
    const [salt] = stored.split(":");
    const truncated = `${salt}:abcd`;
    expect(await verifyPassword("Correct1", truncated)).toBe(false);
  });

  it("handles unicode passwords", async () => {
    const stored = await hashPassword("üéàñö");
    expect(await verifyPassword("üéàñö", stored)).toBe(true);
    expect(await verifyPassword("plain", stored)).toBe(false);
  });
});

describe("computeKeyPrefix", () => {
  it("returns a 16-character hex string", () => {
    const prefix = computeKeyPrefix("si_some-api-key");
    expect(prefix).toHaveLength(16);
    expect(prefix).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic (same input gives same output)", () => {
    const a = computeKeyPrefix("si_test-key-123");
    const b = computeKeyPrefix("si_test-key-123");
    expect(a).toBe(b);
  });

  it("produces different prefixes for different inputs", () => {
    const a = computeKeyPrefix("si_key-alpha");
    const b = computeKeyPrefix("si_key-beta");
    expect(a).not.toBe(b);
  });

  it("works with various key formats", () => {
    const inputs = ["si_short", "si_a-very-long-api-key-with-many-segments-1234567890", "si_"];
    for (const input of inputs) {
      const prefix = computeKeyPrefix(input);
      expect(prefix).toHaveLength(16);
      expect(prefix).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});
